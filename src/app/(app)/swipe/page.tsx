import Link from "next/link";
import CampaignPicker from "@/components/CampaignPicker";
import SwipeDeck from "@/components/SwipeDeck";
import { requireUser } from "@/lib/supabase/server";
import type { Campaign, Lead } from "@/lib/types";

export default async function SwipePage({ searchParams }: PageProps<"/swipe">) {
  const { c } = await searchParams;
  const { supabase } = await requireUser();

  const { data } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
  const campaigns = (data ?? []) as Campaign[];
  if (!campaigns.length) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">Create your first campaign</h1>
        <p className="mt-2 text-sm text-zinc-400">Tell us who you want to reach and what you offer. Then start swiping.</p>
        <Link href="/campaigns" className="btn-primary mt-6">
          New campaign
        </Link>
      </div>
    );
  }

  const campaign = campaigns.find((x) => x.id === c) ?? campaigns[0];
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("status", "new")
    .order("created_at")
    .limit(50);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-6 flex w-full max-w-md items-center justify-between gap-3">
        <CampaignPicker campaigns={campaigns} current={campaign.id} />
        <span className="shrink-0 text-xs text-zinc-500">{campaign.auto_send ? "Auto-send on" : "Review before send"}</span>
      </div>
      <SwipeDeck
        // Remount when a new batch is imported so the deck picks it up.
        key={`${campaign.id}:${leads?.[0]?.id ?? "empty"}`}
        campaign={campaign} initialLeads={(leads ?? []) as Lead[]} />
    </div>
  );
}
