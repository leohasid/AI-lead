import { NextResponse } from "next/server";
import { approveLead, sendDraft } from "@/lib/pipeline";
import { requireUser } from "@/lib/supabase/server";
import type { Lead, Message } from "@/lib/types";

export const maxDuration = 60; // enrichment + AI draft can take a while

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // left = no, right = yes (draft for review), super = yes and send now, undo = bring back a skipped lead
  const { direction } = (await req.json()) as { direction: "left" | "right" | "super" | "undo" };
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (direction === "undo") {
    if (lead.status === "rejected") await supabase.from("leads").update({ status: "new" }).eq("id", id);
    return NextResponse.json({ lead: { ...lead, status: lead.status === "rejected" ? "new" : lead.status } });
  }
  if (lead.status !== "new") return NextResponse.json({ lead });

  if (direction === "left") {
    await supabase.from("leads").update({ status: "rejected" }).eq("id", id);
    return NextResponse.json({ lead: { ...lead, status: "rejected" } });
  }

  try {
    const approved = await approveLead(supabase, lead as Lead);
    if (direction !== "super" || approved.status !== "drafted") return NextResponse.json({ lead: approved });

    const { data: draft } = await supabase
      .from("messages")
      .select("*")
      .eq("lead_id", id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    return NextResponse.json({ lead: await sendDraft(supabase, approved, draft as Message) });
  } catch (e) {
    // Put it back in the deck so it can be retried.
    await supabase.from("leads").update({ status: "new" }).eq("id", id);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
