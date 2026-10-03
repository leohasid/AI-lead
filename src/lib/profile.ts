import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { CATEGORIES, type TagFilter } from "./categories";
import type { Campaign, Lead } from "./types";

// What the user told us at onboarding. Stored on the auth user's metadata.
export type Profile = {
  business: string;
  location: string;
  types: string[]; // chosen business-type ids (see categories.ts); empty = all
  target: string; // free-text "other" types
  targetTags: TagFilter[]; // what AI made of `target`; empty = fall back to keyword search
};

export type Reach = "best" | "local" | "national";
export const REACHES: [Reach, string][] = [
  ["best", "Best match"],
  ["local", "Local"],
  ["national", "Not local"],
];

export function getProfile(user: User): Profile {
  const m = user.user_metadata ?? {};
  return {
    business: m.business ?? "",
    location: m.location ?? "",
    types: m.types ?? [],
    target: m.target ?? "",
    targetTags: m.target_tags ?? [],
  };
}

/** What to search for: the chosen types plus the "other" description; everything when nothing is chosen. */
export function searchFor(profile: Profile): { filters: TagFilter[]; terms: string[]; keywords: string | null } {
  const picked = CATEGORIES.filter((c) => profile.types.includes(c.id));
  const chosen = picked.flatMap((c) => c.filters);
  // "florists, dog groomers and vets" -> one search phrase each.
  const other = profile.target.split(/,|\band\b|\n/).map((t) => t.trim()).filter(Boolean);
  const everything = !picked.length && !other.length;
  // One phrase from each type in turn, so batches mix the types.
  // With no filter, food and drink go last: they're everywhere and would otherwise fill the first batches.
  const common = ["food", "bars", "hotels"];
  const all = [...CATEGORIES].sort((a, b) => Number(common.includes(a.id)) - Number(common.includes(b.id)));
  const lists = (everything ? all : picked).map((c) => c.search);
  const terms = [...other];
  for (let i = 0; lists.some((l) => l[i]); i++) for (const l of lists) if (l[i]) terms.push(l[i]);
  const keywords = profile.target && !profile.targetTags.length ? profile.target : null;
  const filters = [...chosen, ...profile.targetTags];
  if (everything) return { filters: CATEGORIES.flatMap((c) => c.filters), terms, keywords: null };
  return { filters, terms, keywords };
}

export const isOnboarded = (user: User) => {
  const p = getProfile(user);
  return Boolean(p.business && p.location);
};

/**
 * Each user has one deck of leads. It's stored as a campaign row (leads and
 * emails hang off it) but kept in sync with the profile and never shown.
 */
export async function ensureDeck(db: SupabaseClient, user: User): Promise<Campaign> {
  const profile = getProfile(user);
  const fields = { offer: profile.business, keywords: profile.target || null };

  const { data: existing } = await db
    .from("campaigns")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (existing.offer !== fields.offer || existing.keywords !== fields.keywords) {
      await db.from("campaigns").update(fields).eq("id", existing.id);
    }
    return { ...existing, ...fields } as Campaign;
  }

  const email = user.email ?? "";
  const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const { data, error } = await db
    .from("campaigns")
    .insert({ ...fields, owner_id: user.id, name: "My leads", sender_name: name || "Me", sender_email: email })
    .select()
    .single();
  if (error) throw error;
  return data as Campaign;
}

/** True when the lead is in the same town/city as the user. */
export function isLocal(lead: Pick<Lead, "location">, profile: Profile) {
  const city = profile.location.split(",")[0].trim().toLowerCase();
  return Boolean(city && lead.location?.toLowerCase().includes(city));
}

const DECISION_MAKER = /owner|founder|ceo|director|president|partner|principal|manager/i;
const STOP = new Set(["and", "the", "for", "with", "our", "we", "you", "your", "that", "this", "are", "from", "who", "help"]);

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

// AI's case for a lead is kept as plain text: "Strong fit", one "• point" per line, then the summary.
type Fit = "strong" | "moderate" | "weak";
const FIT_LABEL: Record<Fit, Insight["match"]> = { strong: "High", moderate: "Medium", weak: "Low" };

export const formatThesis = (t: { fit: Fit; points: string[]; summary: string }) =>
  [`${t.fit[0].toUpperCase()}${t.fit.slice(1)} fit`, ...t.points.map((p) => `• ${p}`), t.summary].join("\n");

export function parseThesis(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const fit = lines[0]?.match(/^(strong|moderate|weak) fit$/i)?.[1].toLowerCase() as Fit | undefined;
  const rest = fit ? lines.slice(1) : lines;
  return {
    match: fit ? FIT_LABEL[fit] : null,
    points: rest.filter((l) => l.startsWith("• ")).map((l) => l.slice(2)),
    summary: rest.filter((l) => !l.startsWith("• ")).join(" "),
  };
}

/** What the swipe card shows about why a lead fits. */
export type Insight = {
  score: number;
  match: "High" | "Medium" | "Low";
  tags: string[];
  points: string[]; // how the user could help this business (AI); empty until AI has looked at it
  why: string; // one-line verdict
  ai: boolean; // points and why are AI's reasoning, not the rule-of-thumb fallback
  source: string;
  local: boolean;
};

/** Rough fit score (orders the Discover deck) plus the reasons behind it. */
export function leadInsight(lead: Lead, profile: Profile): Insight {
  const about = new Set(words([lead.company, lead.industry, lead.headline].filter(Boolean).join(" ")));
  const targetHits = words(profile.target).filter((w) => about.has(w));
  const businessHits = words(profile.business).filter((w) => about.has(w) && !targetHits.includes(w));
  const decisionMaker = Boolean(lead.title && DECISION_MAKER.test(lead.title));
  const local = isLocal(lead, profile);
  // Google leads carry their rating at the start of the headline: "4.9★ (765 reviews)".
  const [, stars, reviews] = lead.headline?.match(/^(\d\.\d)★ \((\d+) reviews\)/) ?? [];
  const established = Number(stars) >= 4.5 && Number(reviews) >= 50;

  const score =
    3 * new Set(targetHits).size +
    new Set(businessHits).size +
    (decisionMaker ? 2 : 0) +
    (local ? 1 : 0) +
    (established ? 2 : 0) +
    (lead.email ? 2 : 0) +
    (lead.company_domain ? 1 : 0) +
    (lead.linkedin_url ? 1 : 0);

  const tags = [
    targetHits.length > 0 && "Target match",
    decisionMaker && "Decision-maker",
    local && "Local",
    established && "Top rated",
    lead.email && "Email found",
    lead.company_domain && "Has website",
    lead.linkedin_url && "On LinkedIn",
  ].filter(Boolean) as string[];

  const contact = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const reasons = [
    targetHits.length > 0 && `Matches what you're targeting (${[...new Set(targetHits)].join(", ")})`,
    decisionMaker && `${contact || "The contact"} is the ${lead.title}, so they can say yes`,
    local && "Close to you",
    lead.email && "Has a public email you can contact",
  ].filter(Boolean) as string[];
  // Before first contact, ai_summary holds AI's case for this lead (see /api/leads/insights).
  const thesis = lead.status === "new" && lead.ai_summary ? parseThesis(lead.ai_summary) : null;
  const why =
    thesis?.summary ??
    (reasons.length ? `${reasons.join(". ")}.` : `A ${lead.industry ? `${lead.industry.toLowerCase()} ` : ""}business you could help.`);

  return {
    score,
    // AI's verdict when it has one; otherwise the rule-of-thumb score.
    match: thesis?.match ?? (score >= 6 ? "High" : score >= 3 ? "Medium" : "Low"),
    tags,
    points: thesis?.points ?? [],
    why,
    ai: Boolean(thesis),
    source: lead.external_id?.startsWith("demo-") ? "Demo" : lead.external_id?.startsWith("osm-") ? "Map" : lead.external_id?.startsWith("gmaps-") ? "Google" : "Apollo",
    local,
  };
}

export const fitScore = (lead: Lead, profile: Profile) => leadInsight(lead, profile).score;
