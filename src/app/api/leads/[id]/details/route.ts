import { NextResponse } from "next/server";
import { leadBrief } from "@/lib/ai";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";
import { readWebsite } from "@/lib/website";

export const maxDuration = 60;

// Details sheet. Plain GET: the social profiles the business links to from its website.
// With ?full=1 ("Show more"): AI's longer write-up of what they do and how the user could help.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const lead = data as Lead;

  const website = lead.company_domain ? await readWebsite(lead.company_domain) : null;
  if (!new URL(req.url).searchParams.has("full")) return NextResponse.json({ website });

  try {
    const brief = await leadBrief(getProfile(user).business, {
      name: lead.company ?? [lead.first_name, lead.last_name].filter(Boolean).join(" "),
      type: lead.industry,
      about: [website?.description, ...(website?.about ?? [])].filter(Boolean).join(" ").slice(0, 2500) || null,
    });
    return NextResponse.json({ brief });
  } catch (e) {
    console.error("[details]", (e as Error).message);
    return NextResponse.json({ brief: null });
  }
}
