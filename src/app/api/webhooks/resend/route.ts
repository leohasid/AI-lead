import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getResend, leadIdFromAddresses } from "@/lib/email";
import { handleInboundReply } from "@/lib/pipeline";
import { createAdminClient } from "@/lib/supabase/server";

// Resend inbound email webhook (event: email.received).
// The webhook only carries metadata, so we fetch the body from the Receiving API.
export const maxDuration = 60;

type ReceivedEvent = {
  type: string;
  data: { email_id: string; from: string; to: string[]; subject?: string };
};

export async function POST(req: Request) {
  const payload = await req.text();
  let event: ReceivedEvent;
  try {
    event = new Webhook(process.env.RESEND_WEBHOOK_SECRET!).verify(payload, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as unknown as ReceivedEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.received") return NextResponse.json({ ignored: event.type });

  const db = createAdminClient();
  let leadId = leadIdFromAddresses(event.data.to ?? []);

  // Fallback: match on the sender's address if they replied to a different address.
  if (!leadId) {
    const from = event.data.from.match(/<([^>]+)>/)?.[1] ?? event.data.from;
    const { data } = await db
      .from("leads")
      .select("id")
      .ilike("email", from.trim())
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = data?.id ?? null;
  }
  if (!leadId) return NextResponse.json({ ignored: "no matching lead" });

  const { data: email, error } = await getResend().emails.receiving.get(event.data.email_id);
  if (error || !email) return NextResponse.json({ error: error?.message ?? "fetch failed" }, { status: 502 });

  const text = email.text ?? stripHtml(email.html ?? "");
  const result = await handleInboundReply(db, {
    leadId,
    subject: event.data.subject ?? null,
    text: stripQuoted(text),
  });
  return NextResponse.json(result);
}

function stripHtml(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

// Drop the quoted original ("On Tue, X wrote:" and "> " lines) so we store just the reply.
function stripQuoted(text: string) {
  const cut = text.search(/^On .+wrote:\s*$/m);
  const body = cut > 0 ? text.slice(0, cut) : text;
  return body
    .split("\n")
    .filter((l) => !l.startsWith(">"))
    .join("\n")
    .trim();
}
