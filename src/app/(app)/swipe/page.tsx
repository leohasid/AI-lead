import { Flame, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import DeckSkeleton from "@/components/DeckSkeleton";
import SwipeDeck from "@/components/SwipeDeck";
import { fillDeck } from "@/lib/deck";
import { ensureDeck, getProfile, isLocal, leadInsight, REACHES, type Reach } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";

const TABS = [
  { href: "/swipe", label: "Discover", Icon: Flame, reach: "best" },
  { href: "/swipe?view=local", label: "Local", Icon: MapPin, reach: "local" },
  { href: "/pipeline", label: "My Leads", Icon: Users, reach: null },
] as const;

// Finding the first batch of businesses can take a few seconds.
export const maxDuration = 60;

export default async function SwipePage({ searchParams }: PageProps<"/swipe">) {
  const { view, f } = await searchParams;
  const reach: Reach = REACHES.some(([r]) => r === view) ? (view as Reach) : "best";

  return (
    <div className="flex flex-col items-center">
      <nav className="mb-5 flex w-full max-w-md gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 [@media(max-height:720px)]:mb-3">
        {TABS.map(({ href, label, Icon, reach: r }) => {
          const active = r === reach;
          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-900/40"
                  : "text-zinc-300 hover:bg-white/5"
              }`}
            >
              <Icon size={18} className={active ? "fill-white" : ""} />
              {label}
            </Link>
          );
        })}
      </nav>
      {/* The tabs switch straight away; the deck shows a placeholder while its businesses load.
          The key makes the placeholder appear again on every tab or filter change. */}
      <Suspense key={`${reach}:${f ?? ""}`} fallback={<DeckSkeleton />}>
        <Deck reach={reach} />
      </Suspense>
    </div>
  );
}

async function Deck({ reach }: { reach: Reach }) {
  const { supabase, user } = await requireUser();
  const profile = getProfile(user!);
  const deck = await ensureDeck(supabase, user!);

  function arrange(all: Lead[]) {
    const local = all.filter((l) => isLocal(l, profile));
    if (reach === "local") return local;
    // Discover is everywhere else; the Local tab covers the user's own area.
    const elsewhere = all.filter((l) => !isLocal(l, profile));
    return reach === "national" || elsewhere.length ? elsewhere : all;
  }

  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("campaign_id", deck.id)
    .eq("status", "new")
    .order("created_at")
    .limit(300);
  let leads = arrange((data ?? []) as Lead[]);

  // Nothing to swipe on this tab yet: fetch the first batch.
  // (Use what fillDeck returns; re-running the query above would hit Next's request memoization.)
  if (leads.length === 0) {
    try {
      leads = arrange(await fillDeck(supabase, user!, reach));
    } catch {
      // The deck shows "Find more businesses", which surfaces the error on retry.
    }
  }

  const cards = leads.map((lead) => ({ lead, insight: leadInsight(lead, profile) }));
  // Discover puts the best fits first.
  if (reach === "best") cards.sort((a, b) => b.insight.score - a.insight.score);

  return (
    <>
      <SwipeDeck
        // Remount when a new batch is imported.
        key={`${reach}:${cards[0]?.lead.id ?? "empty"}`}
        reach={reach}
        initialCards={cards.slice(0, 50)}
      />
      {cards.some((c) => c.lead.external_id?.startsWith("osm-")) && (
        <p className="mt-4 text-center text-[11px] text-zinc-500">Business data © OpenStreetMap contributors</p>
      )}
    </>
  );
}
