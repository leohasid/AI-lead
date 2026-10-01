import { NextResponse } from "next/server";
import { searchPeople } from "@/lib/apollo";
import { requireUser } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/types";

// Pulls the next page of matching people from Apollo into the swipe deck.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);

  // Apollo returns 25 per page; skip pages we've already imported.
  const page = Math.floor((count ?? 0) / 25) + 1;

  try {
    const people = await searchPeople(campaign as Campaign, page);
    if (people.length === 0) return NextResponse.json({ added: 0 });

    const { data, error } = await supabase
      .from("leads")
      .upsert(
        people.map((p) => ({ ...p, owner_id: user.id, campaign_id: id })),
        { onConflict: "campaign_id,external_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw error;
    return NextResponse.json({ added: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
