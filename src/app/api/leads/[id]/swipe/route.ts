import { NextResponse } from "next/server";
import { approveLead } from "@/lib/pipeline";
import { requireUser } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";

export const maxDuration = 60; // enrichment + AI draft can take a while

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { direction } = (await req.json()) as { direction: "left" | "right" };
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.status !== "new") return NextResponse.json({ lead });

  if (direction === "left") {
    await supabase.from("leads").update({ status: "rejected" }).eq("id", id);
    return NextResponse.json({ lead: { ...lead, status: "rejected" } });
  }

  try {
    return NextResponse.json({ lead: await approveLead(supabase, lead as Lead) });
  } catch (e) {
    // Put it back in the deck so it can be retried.
    await supabase.from("leads").update({ status: "new" }).eq("id", id);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
