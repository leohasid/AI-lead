import { NextResponse } from "next/server";
import { sendDraft } from "@/lib/pipeline";
import { requireUser } from "@/lib/supabase/server";
import type { Lead, Message } from "@/lib/types";

// Send the pending draft (with the user's edits), or a manual follow-up if there is no draft.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subject, body } = (await req.json()) as { subject?: string; body: string };
  if (!body?.trim()) return NextResponse.json({ error: "Message is empty" }, { status: 400 });

  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  let { data: message } = await supabase
    .from("messages")
    .select("*")
    .eq("lead_id", id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!message) {
    const inserted = await supabase
      .from("messages")
      .insert({ owner_id: user.id, lead_id: id, direction: "outbound", subject, body, status: "draft" })
      .select()
      .single();
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    message = inserted.data;
  }

  try {
    const updated = await sendDraft(supabase, lead as Lead, message as Message, { subject, body });
    return NextResponse.json({ lead: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
