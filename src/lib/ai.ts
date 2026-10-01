import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Campaign, Lead, Message } from "./types";

const client = new Anthropic();
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
