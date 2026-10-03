import { NextResponse } from "next/server";
import { leadTheses } from "@/lib/ai";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";
import { readWebsite } from "@/lib/website";

export const maxDuration = 60;

// "Why this lead?" for the next few cards in the deck: AI reads what each
// business says about itself and argues what the user could do for them.
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids } = (await req.json()) as { ids?: string[] };
  const { data } = await supabase
    .from("leads")
    .select("*")
    .in("id", (ids ?? []).slice(0, 8))
    .eq("status", "new");
  const leads = (data ?? []) as Lead[];
  if (!leads.length) return NextResponse.json({ available: true, theses: {} });

  const sites = await Promise.all(leads.map((l) => (l.company_domain ? readWebsite(l.company_domain) : null)));
  const briefs = leads.map((l, i) => ({
    id: l.id,
    name: l.company ?? [l.first_name, l.last_name].filter(Boolean).join(" "),
    type: l.industry,
    location: l.location,
    about: [sites[i]?.description, ...(sites[i]?.about ?? [])].filter(Boolean).join(" ").slice(0, 900) || null,
  }));

  let theses: Record<string, string>;
  try {
    theses = await leadTheses(getProfile(user).business, briefs);
  } catch (e) {
    // No working AI key (or the call failed): the cards keep their basic reasons.
    console.error("[insights]", (e as Error).message);
    return NextResponse.json({ available: false, theses: {} });
  }

  // Keep the reasoning with the lead so it's there next time without asking again.
  await Promise.all(Object.entries(theses).map(([id, why]) => supabase.from("leads").update({ ai_summary: why }).eq("id", id)));
  return NextResponse.json({ available: true, theses });
}
