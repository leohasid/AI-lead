import "server-only";
import { Resend } from "resend";
import type { Campaign, Lead } from "./types";

// Outbound + inbound email through Resend.
// Each lead gets a unique Reply-To (reply+<leadId>@INBOUND_DOMAIN) so incoming
// replies can be matched to the right lead in the inbound webhook.

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

let resend: Resend | null = null;
export function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export function replyAddress(leadId: string) {
  return `reply+${leadId}@${process.env.INBOUND_DOMAIN}`;
}

export function leadIdFromAddresses(addresses: string[]): string | null {
  for (const a of addresses) {
    const m = a.match(/reply\+([0-9a-f-]{36})@/i);
    if (m) return m[1];
  }
  return null;
}

export function composeBody(campaign: Campaign, body: string) {
  return [
    body.trim(),
    "",
    campaign.sender_name,
    campaign.signature.trim(),
    "",
    `If this isn't relevant, just reply "unsubscribe" and I won't reach out again.`,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

export async function sendEmail(opts: {
  campaign: Campaign;
  lead: Lead;
  subject: string;
  body: string;
}): Promise<{ id: string; simulated: boolean }> {
  const { campaign, lead, subject, body } = opts;
  if (!emailEnabled()) {
    console.log(`[email:simulated] to=${lead.email} subject=${subject}\n${body}`);
    return { id: `simulated-${Date.now()}`, simulated: true };
  }
  const { data, error } = await getResend().emails.send({
    from: `${campaign.sender_name} <${campaign.sender_email}>`,
    to: [lead.email!],
    replyTo: process.env.INBOUND_DOMAIN ? replyAddress(lead.id) : undefined,
    subject,
    text: body,
  });
  if (error || !data) throw new Error(`Resend: ${error?.message ?? "unknown error"}`);
  return { id: data.id, simulated: false };
}

export async function notifyByEmail(to: string, subject: string, text: string) {
  if (!emailEnabled() || !process.env.NOTIFY_FROM_EMAIL) return;
  await getResend().emails.send({ from: process.env.NOTIFY_FROM_EMAIL, to: [to], subject, text });
}
