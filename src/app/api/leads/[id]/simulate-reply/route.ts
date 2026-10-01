import { NextResponse } from "next/server";
import { emailEnabled } from "@/lib/email";
import { handleInboundReply } from "@/lib/pipeline";
import { createAdminClient, requireUser } from "@/lib/supabase/server";

// Demo/testing only: pretend the lead replied, so you can try the AI triage and
// notifications without setting up inbound email. Disabled once Resend is configured.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (emailEnabled() && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS check: this only returns the lead if the user owns it.
  const { data: lead } = await supabase.from("leads").select("id").eq("id", id).single();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const { text } = (await req.json()) as { text: string };
  try {
    const result = await handleInboundReply(createAdminClient(), { leadId: id, subject: "Re:", text });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
