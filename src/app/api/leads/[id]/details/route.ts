import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { readWebsite } from "@/lib/website";

export const maxDuration = 30;

// Details sheet: what the business says about itself on its own website.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: lead } = await supabase.from("leads").select("company_domain").eq("id", id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const website = lead.company_domain ? await readWebsite(lead.company_domain) : null;
  return NextResponse.json({ website });
}
