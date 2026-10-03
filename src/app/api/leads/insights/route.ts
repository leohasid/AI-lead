import { NextResponse } from "next/server";
import { leadTheses, type Thesis } from "@/lib/ai";
import { formatThesis, getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";
import { readWebsite } from "@/lib/website";

export const maxDuration = 60;

// "Why this lead?" for the next few cards in the deck: AI works out how the
// user's business could help each one (bullet points plus a one-line verdict).
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

  const sites = await Promise.all(leads.map((l) => (l.company_domain ? readWebsite(l.company_domain, true) : null)));
  const briefs = leads.map((l, i) => ({
    id: l.id,
    name: l.company ?? [l.first_name, l.last_name].filter(Boolean).join(" "),
    type: l.industry,
    // Enough of their own words for AI to see what sets this business apart from others like it.
    about: [sites[i]?.title, sites[i]?.description, ...(sites[i]?.about ?? [])].filter(Boolean).join(" ").slice(0, 1800) || null,
  }));

  let theses: Record<string, Thesis>;
  try {
    theses = await leadTheses(getProfile(user).business, briefs);
  } catch (e) {
    // No working AI key (or the call failed): the cards keep their basic reasons.
    console.error("[insights]", (e as Error).message);
    return NextResponse.json({ available: false, theses: {} });
  }

  // Keep the reasoning with the lead so it's there next time without asking again.
  await Promise.all(Object.entries(theses).map(([id, t]) => supabase.from("leads").update({ ai_summary: formatThesis(t) }).eq("id", id)));
  const match = { strong: "High", moderate: "Medium", weak: "Low" } as const;
  return NextResponse.json({
    available: true,
    theses: Object.fromEntries(Object.entries(theses).map(([id, t]) => [id, { ...t, match: match[t.fit] }])),
  });
}
