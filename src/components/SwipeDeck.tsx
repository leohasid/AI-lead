"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Building2, Clock, FileText, Globe, Heart, MapPin, Sparkles, Target, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Insight, Reach } from "@/lib/profile";
import type { Lead } from "@/lib/types";

type CardData = { lead: Lead; insight: Insight };
type Direction = "left" | "right" | "super";
type Activity = { id: string; name: string; state: "working" | "done" | "no_email" | "error"; detail?: string };

const SWIPE_THRESHOLD = 120;

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unknown";
}

const businessName = (l: Lead) => l.company || fullName(l);

function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 60 / 24)}d ago`;
}

// A stable colour scheme per industry, so the same kind of business always looks the same.
const SCENES = [
  "from-fuchsia-600 via-violet-700 to-indigo-950",
  "from-orange-500 via-rose-600 to-purple-950",
  "from-sky-500 via-indigo-600 to-violet-950",
  "from-emerald-500 via-teal-700 to-slate-950",
  "from-amber-400 via-orange-600 to-rose-950",
  "from-pink-500 via-purple-700 to-slate-950",
];
function scene(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SCENES[h % SCENES.length];
}

export default function SwipeDeck({ reach, initialCards }: { reach: Reach; initialCards: CardData[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [exitDir, setExitDir] = useState<"left" | "right">("right");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [lastSkipped, setLastSkipped] = useState<CardData | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState("");

  const top = cards[0];

  const swipe = useCallback(
    (direction: Direction) => {
      const card = cards[0];
      if (!card) return;
      const { lead } = card;
      setExitDir(direction === "left" ? "left" : "right");
      setCards((prev) => prev.slice(1));
      setLastSkipped(direction === "left" ? card : null);

      // Yes swipes take a few seconds (email lookup + AI draft); run in the background.
      if (direction !== "left") setActivity({ id: lead.id, name: businessName(lead), state: "working" });
      fetch(`/api/leads/${lead.id}/swipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      })
        .then(async (res) => {
          if (direction === "left") return;
          const json = await res.json();
          const state: Activity["state"] = !res.ok ? "error" : json.lead?.status === "no_email" ? "no_email" : "done";
          const detail = !res.ok
            ? json.error
            : state === "no_email"
              ? "No verified email found"
              : json.lead?.status === "contacted"
                ? "Email sent"
                : "Draft ready to review";
          setActivity((a) => (a?.id === lead.id ? { ...a, state, detail } : a));
        })
        .catch((e) => setActivity((a) => (a?.id === lead.id ? { ...a, state: "error", detail: String(e) } : a)));
    },
    [cards],
  );

  async function undo() {
    if (!lastSkipped) return;
    const card = lastSkipped;
    setLastSkipped(null);
    setExitDir("left");
    setCards((prev) => [card, ...prev]);
    await fetch(`/api/leads/${card.lead.id}/swipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "undo" }),
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") swipe("left");
      if (e.key === "ArrowRight") swipe("right");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [swipe]);

  async function findMore() {
    setFinding(true);
    setFindError("");
    const res = await fetch("/api/leads/find", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reach }),
    });
    const json = await res.json();
    setFinding(false);
    if (!res.ok) return setFindError(json.error ?? "Search failed");
    if (json.added === 0) return setFindError("No new businesses found for this filter. Try another one.");
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center">
      <div className="relative h-[clamp(330px,calc(100dvh-330px),560px)] w-full">
        {/* Stacked cards peeking out behind the top one */}
        {cards.length > 1 && (
          <>
            <div className="absolute inset-x-6 -bottom-3 top-3 rounded-3xl border border-white/10 bg-white/[0.03]" />
            <div className="absolute inset-x-3 -bottom-1.5 top-1.5 rounded-3xl border border-white/10 bg-white/[0.04]" />
          </>
        )}
        <AnimatePresence custom={exitDir}>
          {top ? (
            <Card key={top.lead.id} card={top} onSwipe={swipe} exitDir={exitDir} />
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#14112a] p-8 text-center"
            >
              <div className="text-lg font-medium">You&apos;re all caught up</div>
              <p className="mt-2 text-sm text-zinc-400">Load the next batch of businesses for you to swipe on.</p>
              <button onClick={findMore} disabled={finding} className="btn-primary mt-6">
                {finding ? "Searching…" : "Find more businesses"}
              </button>
              {findError && <p className="mt-3 text-sm text-amber-300">{findError}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-5 flex items-center gap-5 [@media(max-height:720px)]:mt-3">
        <RoundButton onClick={undo} disabled={!lastSkipped} label="Undo last skip" className="h-14 w-14 border-white/15 text-zinc-300">
          <Undo2 size={24} />
        </RoundButton>
        <RoundButton
          onClick={() => swipe("left")}
          disabled={!top}
          label="No"
          className="h-[72px] w-[72px] border-rose-500/70 bg-rose-500/10 text-rose-500 shadow-[0_0_30px_-8px] shadow-rose-500/60"
        >
          <X size={40} strokeWidth={3} />
        </RoundButton>
        <RoundButton
          onClick={() => swipe("right")}
          disabled={!top}
          label="Yes"
          className="h-[72px] w-[72px] border-emerald-400/70 bg-emerald-500/10 text-emerald-400 shadow-[0_0_30px_-8px] shadow-emerald-400/60"
        >
          <Heart size={38} className="fill-emerald-400" />
        </RoundButton>
        <RoundButton
          onClick={() => swipe("super")}
          disabled={!top}
          label="Yes, and send the email straight away"
          className="h-14 w-14 border-violet-500/60 bg-violet-500/10 text-fuchsia-400"
        >
          <Sparkles size={24} className="fill-fuchsia-400" />
        </RoundButton>
      </div>

      {activity && (
        <Link href={`/leads/${activity.id}`} className="mt-5 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm">
          <span className="truncate">{activity.name}</span>
          <span
            className={
              activity.state === "working"
                ? "text-zinc-400"
                : activity.state === "done"
                  ? "text-emerald-400"
                  : activity.state === "no_email"
                    ? "text-amber-300"
                    : "text-rose-400"
            }
          >
            {activity.state === "working" ? "Finding email & writing…" : activity.detail}
          </span>
        </Link>
      )}
    </div>
  );
}

function RoundButton({
  onClick,
  disabled,
  label,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-full border-2 transition hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}

function Card({ card, onSwipe, exitDir }: { card: CardData; onSwipe: (d: Direction) => void; exitDir: "left" | "right" }) {
  const { lead, insight } = card;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-18, 18]);
  const likeOpacity = useTransform(x, [30, SWIPE_THRESHOLD], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_THRESHOLD, -30], [1, 0]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) onSwipe("right");
    else if (info.offset.x < -SWIPE_THRESHOLD) onSwipe("left");
  }

  const name = businessName(lead);
  const initials = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  // Person and job title when we know them; otherwise the business's phone number.
  const person = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const contact = [lead.company ? person : "", lead.title].filter(Boolean).join(" • ") || (person ? "" : lead.headline);
  const matchColour = insight.match === "High" ? "text-emerald-400" : insight.match === "Medium" ? "text-amber-300" : "text-zinc-300";

  return (
    <motion.div
      className="absolute inset-0 flex cursor-grab flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#14112a] shadow-2xl shadow-black/50 active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ x: exitDir === "right" ? 500 : -500, opacity: 0, rotate: exitDir === "right" ? 20 : -20 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute left-6 top-20 z-20 -rotate-12 rounded-lg border-4 border-emerald-400 px-3 py-1 text-2xl font-black text-emerald-400"
      >
        YES
      </motion.div>
      <motion.div
        style={{ opacity: nopeOpacity }}
        className="absolute right-6 top-20 z-20 rotate-12 rounded-lg border-4 border-rose-500 px-3 py-1 text-2xl font-black text-rose-500"
      >
        NO
      </motion.div>

      {/* Hero: badges sit in their own row so they never cover the initials */}
      <div className={`relative flex h-[38%] shrink-0 flex-col [@media(max-height:720px)]:h-auto bg-gradient-to-br ${scene(lead.industry ?? name)}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_55%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#14112a] to-transparent" />
        <div className="relative flex items-start justify-between gap-2 p-4 [@media(max-height:720px)]:p-3">
          <span className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-400/40 bg-black/50 px-3 py-1.5 text-sm font-medium backdrop-blur">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            New Lead
          </span>
          {lead.industry && (
            <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-sm font-medium backdrop-blur">
              <Building2 size={16} className="shrink-0" />
              <span className="truncate">{lead.industry}</span>
            </span>
          )}
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center pb-4 [@media(max-height:720px)]:pb-1">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-white/95 text-3xl font-bold text-violet-700 shadow-xl [@media(max-height:720px)]:h-14 [@media(max-height:720px)]:w-14 [@media(max-height:720px)]:rounded-2xl [@media(max-height:720px)]:text-xl">
            {initials || "?"}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col px-5 pb-4 [@media(max-height:720px)]:pb-3">
        <h2 className="truncate text-[28px] font-bold leading-tight [@media(max-height:720px)]:text-2xl">{name}</h2>
        {contact && <p className="mt-1 text-zinc-300">{contact}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300 [@media(max-height:720px)]:mt-1">
          {lead.location && (
            <span className="flex items-center gap-1.5">
              <MapPin size={16} className="text-zinc-400" />
              {lead.location}
            </span>
          )}
          {lead.company_domain && (
            <span className="flex items-center gap-1.5">
              <Globe size={16} className="text-zinc-400" />
              {lead.company_domain}
            </span>
          )}
        </p>

        {insight.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 [@media(max-height:720px)]:hidden">
            {insight.tags.slice(0, 4).map((t, i) => (
              <span
                key={t}
                className={`rounded-full border px-3 py-1 text-xs ${i === 0 ? "border-violet-500/60 bg-violet-500/20 text-violet-100" : "border-white/15 bg-white/[0.04] text-zinc-200"}`}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
            <Sparkles size={16} className="fill-violet-400" />
            Why this lead?
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-zinc-300 [@media(max-height:720px)]:line-clamp-1">{insight.why}</p>
        </div>

        <div className="mt-auto grid shrink-0 grid-cols-3 divide-x divide-white/10 pt-3 [@media(max-height:720px)]:pt-2">
          <Stat Icon={Target} label="Match" value={insight.match} valueClass={matchColour} iconClass="text-emerald-400" />
          <Stat Icon={Clock} label="Added" value={timeAgo(lead.created_at)} />
          <Stat Icon={FileText} label="Source" value={insight.source} />
        </div>
      </div>
    </motion.div>
  );
}

function Stat({
  Icon,
  label,
  value,
  valueClass = "text-zinc-100",
  iconClass = "text-zinc-300",
}: {
  Icon: typeof Target;
  label: string;
  value: string;
  valueClass?: string;
  iconClass?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 px-1.5 first:pl-0 last:pr-0">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 ${iconClass}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] text-zinc-400">{label}</span>
        {/* "Added" is relative to now, so server and browser can differ by a minute. */}
        <span suppressHydrationWarning className={`block truncate text-sm font-medium ${valueClass}`}>
          {value}
        </span>
      </span>
    </div>
  );
}
