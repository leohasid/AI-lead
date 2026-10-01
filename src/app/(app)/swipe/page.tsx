import Link from "next/link";
import SwipeDeck from "@/components/SwipeDeck";
import { fillDeck } from "@/lib/deck";
import { ensureDeck, fitScore, getProfile, isLocal, REACHES, type Reach } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";

export default async function SwipePage({ searchParams }: PageProps<"/swipe">) {
  const { view } = await searchParams;
  const reach: Reach = REACHES.some(([r]) => r === view) ? (view as Reach) : "best";

  const { supabase, user } = await requireUser();
  const profile = getProfile(user!);
  const deck = await ensureDeck(supabase, user!);

  function arrange(all: Lead[]) {
    if (reach === "local") return all.filter((l) => isLocal(l, profile));
    if (reach === "national") return all.filter((l) => !isLocal(l, profile));
    return all
      .map((l) => [fitScore(l, profile), l] as const)
      .sort((a, b) => b[0] - a[0])
      .map(([, l]) => l);
  }

  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("campaign_id", deck.id)
    .eq("status", "new")
    .order("created_at")
    .limit(300);
  let leads = arrange((data ?? []) as Lead[]);

  // Nothing to swipe on this filter yet: fetch the first batch before showing the page.
  // (Use what fillDeck returns; re-running the query above would hit Next's request memoization.)
  if (leads.length === 0) {
    try {
      leads = arrange(await fillDeck(supabase, user!, reach));
    } catch {
      // The deck shows "Find more businesses", which surfaces the error on retry.
    }
  }

  return (
    <div className="flex flex-col items-center">
      <nav className="mb-4 flex w-full max-w-md gap-1 rounded-xl border border-white/10 p-1 text-sm">
        {REACHES.map(([r, label]) => (
          <Link
            key={r}
            href={`/swipe?view=${r}`}
            className={`flex-1 rounded-lg px-3 py-1.5 text-center ${r === reach ? "bg-violet-500/25 text-white" : "text-zinc-400 hover:bg-white/5"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {reach === "local" && (
        <p className="-mt-3 mb-4 text-xs text-zinc-500">Businesses around {profile.location}</p>
      )}
      <SwipeDeck
        // Remount when the filter changes or a new batch is imported.
        key={`${reach}:${leads[0]?.id ?? "empty"}`}
        reach={reach}
        initialLeads={leads.slice(0, 50)}
      />
    </div>
  );
}
