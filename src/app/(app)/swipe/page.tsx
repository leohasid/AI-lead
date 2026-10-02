import { Flame, MapPin, Users } from "lucide-react";
import Link from "next/link";
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

export default async function SwipePage({ searchParams }: PageProps<"/swipe">) {
  const { view } = await searchParams;
  const reach: Reach = REACHES.some(([r]) => r === view) ? (view as Reach) : "best";

  const { supabase, user } = await requireUser();
  const profile = getProfile(user!);
  const deck = await ensureDeck(supabase, user!);

  function arrange(all: Lead[]) {
    if (reach === "local") return all.filter((l) => isLocal(l, profile));
    if (reach === "national") return all.filter((l) => !isLocal(l, profile));
    return all;
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

  const cards = leads.map((lead) => ({ lead, insight: leadInsight(lead, profile) }));
  // Discover puts the best fits first.
  if (reach === "best") cards.sort((a, b) => b.insight.score - a.insight.score);

  return (
    <div className="flex flex-col items-center">
      <nav className="mb-5 flex w-full max-w-md [@media(max-height:720px)]:mb-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
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
      <SwipeDeck
        // Remount when the filter changes or a new batch is imported.
        key={`${reach}:${cards[0]?.lead.id ?? "empty"}`}
        reach={reach}
        initialCards={cards.slice(0, 50)}
      />
    </div>
  );
}
