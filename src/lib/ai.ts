import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { TAG_KEYS, type TagFilter } from "./categories";
import type { Campaign, Lead, Message } from "./types";

// A personal (sk-ant-usr-) key only works together with the workspace it should bill to.
const client = new Anthropic(
  process.env.ANTHROPIC_WORKSPACE_ID
    ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } }
    : {},
);
const MODEL = "claude-opus-5";

// Server-side fallback: if a request is declined by a safety classifier, the API
// re-runs it on Anthropic's recommended fallback model instead of returning a refusal.
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
  fallbacks: "default" as const,
};

async function jsonCall<T>(system: string, prompt: string, schema: Record<string, unknown>): Promise<T> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: prompt }],
    ...FALLBACK,
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text) as T;
}

function describeLead(lead: Lead) {
  return [
    `Name: ${[lead.first_name, lead.last_name].filter(Boolean).join(" ")}`,
    lead.title && `Title: ${lead.title}`,
    lead.headline && `Headline: ${lead.headline}`,
    lead.company && `Company: ${lead.company}${lead.company_domain ? ` (${lead.company_domain})` : ""}`,
    lead.industry && `Industry: ${lead.industry}`,
    lead.location && `Location: ${lead.location}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type DraftEmail = { subject: string; body: string };

export async function draftOutreach(campaign: Campaign, lead: Lead): Promise<DraftEmail> {
  return jsonCall<DraftEmail>(
    `You write first-touch cold emails for an agency. Write like a real person, not a marketer:
- 60-110 words, plain text, no links, no emojis, no bullet points.
- Open with something specific to the prospect's role, company or industry. Never invent facts about them you weren't given.
- One clear, low-friction ask (e.g. "worth a quick chat?").
- Subject: 2-6 words, lowercase is fine, no clickbait.
- Do not include a signature or sign-off name; it is appended automatically.`,
    `What the agency offers:
${campaign.offer}

Sender: ${campaign.sender_name}

Prospect:
${describeLead(lead)}`,
    {
      type: "object",
      properties: { subject: { type: "string" }, body: { type: "string" } },
      required: ["subject", "body"],
      additionalProperties: false,
    },
  );
}

export type ReplyVerdict = {
  intent: "interested" | "question" | "not_interested" | "unsubscribe" | "out_of_office" | "other";
  summary: string;
};

export async function classifyReply(campaign: Campaign, lead: Lead, thread: Message[]): Promise<ReplyVerdict> {
  const transcript = thread
    .map((m) => `[${m.direction === "outbound" ? "AGENCY" : "PROSPECT"}]\n${m.body}`)
    .join("\n\n---\n\n");

  return jsonCall<ReplyVerdict>(
    `You triage replies to agency cold outreach. Read the prospect's latest reply in context and classify its intent:
- interested: wants to talk, asks for a call/pricing/details, or otherwise shows buying interest
- question: asks something but interest is unclear
- not_interested: declines
- unsubscribe: asks not to be contacted again
- out_of_office: auto-reply
- other: anything else
summary: one sentence the agency can read in a notification, e.g. "Wants a call next Tuesday, asked about pricing."`,
    `Agency offer: ${campaign.offer}

Prospect:
${describeLead(lead)}

Conversation (oldest first):
${transcript}`,
    {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: ["interested", "question", "not_interested", "unsubscribe", "out_of_office", "other"],
        },
        summary: { type: "string" },
      },
      required: ["intent", "summary"],
      additionalProperties: false,
    },
  );
}

/** Turn "wedding photographers and florists" into OpenStreetMap tags the business search can use. */
export async function interpretBusinessTypes(description: string): Promise<TagFilter[]> {
  const { filters } = await jsonCall<{ filters: TagFilter[] }>(
    `You translate a plain-English description of the kinds of business someone wants as clients into OpenStreetMap tags.
Return the tag keys and values that businesses of those kinds are mapped with, e.g. "gyms" -> leisure=fitness_centre, "florists" -> shop=florist, "accountants" -> office=accountant, "plumbers and electricians" -> craft=plumber, craft=electrician.
Use real OpenStreetMap values (lowercase, underscores). Include close variants a mapper might have used. Leave out anything that isn't a kind of business. If nothing in the description is a kind of business, return an empty list.`,
    description,
    {
      type: "object",
      properties: {
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string", enum: [...TAG_KEYS] },
              values: { type: "array", items: { type: "string" } },
            },
            required: ["key", "values"],
            additionalProperties: false,
          },
        },
      },
      required: ["filters"],
      additionalProperties: false,
    },
  );
  return cleanTags(filters);
}

// The values go into a map query, so keep only plain tag values.
function cleanTags(filters: TagFilter[]) {
  return filters
    .map((f) => ({ key: f.key, values: f.values.filter((v) => /^[a-z0-9_]{2,40}$/.test(v)).slice(0, 12) }))
    .filter((f) => TAG_KEYS.includes(f.key) && f.values.length > 0)
    .slice(0, 12);
}

const TAG_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      key: { type: "string", enum: [...TAG_KEYS] },
      values: { type: "array", items: { type: "string" } },
    },
    required: ["key", "values"],
    additionalProperties: false,
  },
};

/**
 * Which kinds of business should this user be shown when they haven't picked any?
 * Returns search phrases ("dental clinics") and the matching OpenStreetMap tags.
 */
export async function suggestTargets(business: string): Promise<{ terms: string[]; tags: TagFilter[] }> {
  const { targets } = await jsonCall<{ targets: { phrase: string; tags: TagFilter[] }[] }>(
    `A business owner describes what their business does. Choose the 8 kinds of local business most likely to need and buy that, best first.
- Think about who has the problem the owner solves, can afford it, and decides for themselves (independent businesses, not national chains).
- phrase: what you would type into a maps search to find them, plural, 1-3 words, e.g. "dental clinics", "estate agents", "law firms".
- tags: the OpenStreetMap tags businesses of that kind are mapped with, e.g. amenity=dentist, office=estate_agent, office=lawyer. Real OpenStreetMap values only (lowercase, underscores).
- Spread across different sectors rather than eight variations of one.`,
    business,
    {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "object",
            properties: { phrase: { type: "string" }, tags: TAG_SCHEMA },
            required: ["phrase", "tags"],
            additionalProperties: false,
          },
        },
      },
      required: ["targets"],
      additionalProperties: false,
    },
  );
  const terms = targets.map((t) => t.phrase.trim().toLowerCase()).filter((p) => p && p.length <= 40).slice(0, 10);
  return { terms, tags: cleanTags(targets.flatMap((t) => t.tags)) };
}

export type LeadBrief = { id: string; name: string; type: string | null; about: string | null };

export type Thesis = { about: string; focus: string[]; fit: "strong" | "moderate" | "weak"; points: string[]; summary: string };

/**
 * "Why this lead?" for a handful of swipe cards: what the user's business could
 * do for each one, as quick bullet points plus a one-line verdict. By lead id.
 */
export async function leadTheses(business: string, leads: LeadBrief[]): Promise<Record<string, Thesis>> {
  const { theses } = await jsonCall<{ theses: ({ id: string } & Thesis)[] }>(
    `You help a business owner decide, at a glance, which prospects are worth contacting. For each prospect, say in one line what they do, then work out how the owner's business could help them.
- about: what this particular business does, in your own words, in at most 16 words. Lead with what makes it different from others of its type: its specialisms, who it serves, its size or how it works. "Law firm handling legal cases" is useless; "Immigration and family law firm for South Asian families, with evening appointments" is right. Never copy or quote their marketing wording. With no description, just name the kind of business plainly (e.g. "Solicitors' practice in Manchester"); don't comment on the missing description and don't guess specifics.
- focus: 2 or 3 labels for the specific things this business offers or specialises in, taken from their description, each 1 or 2 words and at most 16 characters (e.g. "Immigration", "Invisalign", "Payroll"). Empty if their description doesn't say.
- fit: how well what the owner offers matches what this prospect likely needs: strong, moderate or weak.
- points: 2 or 3 bullet points, each one service the owner could provide to this prospect, drawn from what the owner's business offers and matched to what this prospect does and how a business like theirs actually runs (its bookings, enquiries, admin, sales, staff, stock...). Tie each point to this prospect's own specialisms where you can, so two businesses of the same type don't get the same list. Each starts with a verb and must fit on one line of a phone screen: at most 5 words and 32 characters, counted strictly. No full stops.
- summary: one short sentence, at most 12 words: the best angle to open with. Don't restate the fit level.
- Use the prospect's own description only to make the points specific. Never invent facts about them: no made-up problems, numbers or tools.
- If the fit is weak, give fewer points and say so plainly in the summary rather than stretching.
- Ratings, review counts, location and having a website are not reasons.
- Plain English, addressed to the owner as "you". No sales language.`,
    `What the owner's business does:
${business}

Prospects:
${leads
  .map((l) =>
    [`id: ${l.id}`, `Name: ${l.name}`, l.type && `Type: ${l.type}`, l.about && `In their own words: ${l.about}`].filter(Boolean).join("\n"),
  )
  .join("\n\n")}`,
    {
      type: "object",
      properties: {
        theses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              about: { type: "string" },
              focus: { type: "array", items: { type: "string" } },
              fit: { type: "string", enum: ["strong", "moderate", "weak"] },
              points: { type: "array", items: { type: "string" } },
              summary: { type: "string" },
            },
            required: ["id", "about", "focus", "fit", "points", "summary"],
            additionalProperties: false,
          },
        },
      },
      required: ["theses"],
      additionalProperties: false,
    },
  );
  const ids = new Set(leads.map((l) => l.id));
  return Object.fromEntries(
    theses
      .filter((t) => ids.has(t.id) && t.summary.trim())
      .map((t) => [
        t.id,
        {
          about: t.about.trim(),
          focus: t.focus.map((f) => f.trim()).filter((f) => f && f.length <= 20).slice(0, 3),
          fit: t.fit, 
          points: t.points.map((p) => p.trim()).filter(Boolean).slice(0, 3),
          summary: t.summary.trim(),
        },
      ]),
  );
}

/** Whether Claude can be reached with the configured key, and if not, why (shown on the More page). */
export async function aiStatus(): Promise<{ ok: boolean; detail: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, detail: "ANTHROPIC_API_KEY is not set" };
  if (key.startsWith("sk-ant-usr") && !process.env.ANTHROPIC_WORKSPACE_ID) {
    return { ok: false, detail: "This is a personal key, so ANTHROPIC_WORKSPACE_ID must be set too" };
  }
  try {
    // Listing models is free and proves the key (and workspace) are accepted.
    await client.models.list({ limit: 1 });
    return { ok: true, detail: "Writes lead reasoning and emails" };
  } catch (e) {
    return { ok: false, detail: e instanceof Anthropic.APIError ? `Claude rejected the key (${e.status})` : "Couldn't reach Claude" };
  }
}

export type FullBrief = { about: string; help: { service: string; how: string }[] };

/** The longer write-up behind "Show more": what one business does and how the user's business could help it. */
export async function leadBrief(business: string, lead: Omit<LeadBrief, "id">): Promise<FullBrief> {
  return jsonCall<FullBrief>(
    `You brief a business owner on one prospect before they get in touch.
- about: what this prospect does, summarised in your own words in 2 sentences, at most 40 words: what they offer, who for, and anything notable about how they operate. Never copy or quote their website or marketing wording.
- help: 3 services the owner could provide to this prospect, drawn from what the owner's business offers and matched to what this prospect actually does. For each: "service" names it in at most 6 words; "how" says in one sentence, at most 22 words, what it would do for this prospect in particular and why it matters to them.
- Never invent facts about the prospect: no made-up problems, numbers or tools. Say "likely" for anything you are inferring from the kind of business it is.
- If something the owner offers doesn't fit this prospect, leave it out rather than stretching.
- Plain English, addressed to the owner as "you". No sales language.`,
    `What the owner's business does:
${business}

Prospect:
${[`Name: ${lead.name}`, lead.type && `Type: ${lead.type}`, lead.about && `From their website: ${lead.about}`].filter(Boolean).join("\n")}`,
    {
      type: "object",
      properties: {
        about: { type: "string" },
        help: {
          type: "array",
          items: {
            type: "object",
            properties: { service: { type: "string" }, how: { type: "string" } },
            required: ["service", "how"],
            additionalProperties: false,
          },
        },
      },
      required: ["about", "help"],
      additionalProperties: false,
    },
  );
}
