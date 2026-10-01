import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyReply, draftOutreach } from "./ai";
import { enrichPerson } from "./apollo";
import { composeBody, notifyByEmail, sendEmail } from "./email";
import type { Campaign, Lead, LeadStatus, Message } from "./types";

// The lead lifecycle:
//   new --swipe right--> approved --enrich+draft--> drafted --send--> contacted
//     --reply--> replied | interested | not_interested
//   new --swipe left--> rejected

async function setStatus(db: SupabaseClient, leadId: string, status: LeadStatus, extra: Partial<Lead> = {}) {
  const { error } = await db
    .from("leads")
    .update({ ...extra, status, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;
}

async function getCampaign(db: SupabaseClient, id: string): Promise<Campaign> {
  const { data, error } = await db.from("campaigns").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Campaign;
}

async function isSuppressed(db: SupabaseClient, ownerId: string, email: string) {
  const { data } = await db
    .from("suppressions")
    .select("email")
    .eq("owner_id", ownerId)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return Boolean(data);
}

/** Swipe right: reveal email, write a personalized draft, optionally send it. */
export async function approveLead(db: SupabaseClient, lead: Lead): Promise<Lead> {
  await setStatus(db, lead.id, "approved");
  const campaign = await getCampaign(db, lead.campaign_id);

  let enriched: Lead = lead;
  if (!lead.email && lead.external_id) {
    const person = await enrichPerson(lead.external_id);
    if (person) {
      // Only overwrite fields the enrichment actually filled in.
      const updates = Object.fromEntries(
        Object.entries(person).filter(([k, v]) => v != null && v !== "" && k !== "external_id"),
      ) as Partial<Lead>;
      enriched = { ...lead, ...updates };
    }
  }

  if (!enriched.email || (await isSuppressed(db, lead.owner_id, enriched.email))) {
    await setStatus(db, lead.id, "no_email", stripMeta(enriched));
    return { ...enriched, status: "no_email" };
  }

  const draft = await draftOutreach(campaign, enriched);
  const { data: message, error } = await db
    .from("messages")
    .insert({
      owner_id: lead.owner_id,
      lead_id: lead.id,
      direction: "outbound",
      subject: draft.subject,
      body: composeBody(campaign, draft.body),
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;

  await setStatus(db, lead.id, "drafted", stripMeta(enriched));
  const drafted = { ...enriched, status: "drafted" as const };

  if (campaign.auto_send) return sendDraft(db, drafted, message as Message);
  return drafted;
}

/** Send an outbound draft (optionally edited by the user first). */
export async function sendDraft(
  db: SupabaseClient,
  lead: Lead,
  message: Message,
  edits?: { subject?: string; body?: string },
): Promise<Lead> {
  const campaign = await getCampaign(db, lead.campaign_id);
  const subject = edits?.subject ?? message.subject ?? "";
  const body = edits?.body ?? message.body;

  if (!lead.email) throw new Error("Lead has no email");
  if (await isSuppressed(db, lead.owner_id, lead.email)) throw new Error("This address has unsubscribed");

  try {
    const sent = await sendEmail({ campaign, lead, subject, body });
    await db
      .from("messages")
      .update({ subject, body, status: "sent", provider_id: sent.id })
      .eq("id", message.id);
  } catch (e) {
    await db.from("messages").update({ subject, body, status: "failed" }).eq("id", message.id);
    throw e;
  }

  if (lead.status === "drafted") await setStatus(db, lead.id, "contacted");
  return { ...lead, status: lead.status === "drafted" ? "contacted" : lead.status };
}

/**
 * An inbound reply arrived. Store it, let Claude classify it, update the lead,
 * and notify the agency. `db` must be an admin client (called from a webhook).
 */
export async function handleInboundReply(
  db: SupabaseClient,
  input: { leadId: string; subject: string | null; text: string },
) {
  const { data: lead } = await db.from("leads").select("*").eq("id", input.leadId).maybeSingle();
  if (!lead) return { ignored: "unknown lead" };

  await db.from("messages").insert({
    owner_id: lead.owner_id,
    lead_id: lead.id,
    direction: "inbound",
    subject: input.subject,
    body: input.text,
    status: "received",
  });

  const [campaign, { data: thread }] = await Promise.all([
    getCampaign(db, lead.campaign_id),
    db.from("messages").select("*").eq("lead_id", lead.id).neq("status", "draft").order("created_at"),
  ]);

  const verdict = await classifyReply(campaign, lead as Lead, (thread ?? []) as Message[]);
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email;

  if (verdict.intent === "out_of_office") {
    await db.from("leads").update({ ai_summary: verdict.summary }).eq("id", lead.id);
    return { intent: verdict.intent };
  }

  const status: LeadStatus =
    verdict.intent === "interested"
      ? "interested"
      : verdict.intent === "not_interested" || verdict.intent === "unsubscribe"
        ? "not_interested"
        : "replied";
  await setStatus(db, lead.id, status, { ai_summary: verdict.summary });

  if (lead.email && (verdict.intent === "unsubscribe" || verdict.intent === "not_interested")) {
    await db
      .from("suppressions")
      .upsert({ owner_id: lead.owner_id, email: lead.email.toLowerCase(), reason: verdict.intent });
  }

  const interested = status === "interested";
  const title = interested ? `🔥 ${name} is interested` : `${name} replied`;
  await db.from("notifications").insert({
    owner_id: lead.owner_id,
    lead_id: lead.id,
    kind: interested ? "interested" : "reply",
    title,
    body: verdict.summary,
  });

  const { data: owner } = await db.auth.admin.getUserById(lead.owner_id);
  if (owner.user?.email) {
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/leads/${lead.id}`;
    await notifyByEmail(owner.user.email, title, `${verdict.summary}\n\nOpen the conversation: ${link}`);
  }

  return { intent: verdict.intent };
}

const PROFILE_FIELDS = [
  "first_name", "last_name", "title", "headline", "company", "company_domain",
  "industry", "location", "linkedin_url", "photo_url", "email",
] as const;

/** Just the profile fields, for writing enrichment results back to the row. */
function stripMeta(lead: Lead): Partial<Lead> {
  return Object.fromEntries(PROFILE_FIELDS.map((k) => [k, lead[k]]));
}
