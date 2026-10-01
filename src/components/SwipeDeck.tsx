"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Reach } from "@/lib/profile";
import type { Lead } from "@/lib/types";

type Activity = { id: string; name: string; state: "working" | "done" | "no_email" | "error"; detail?: string };

const SWIPE_THRESHOLD = 120;

function fullName(l: Lead) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unknown";
}

const businessName = (l: Lead) => l.company || fullName(l);

export default function SwipeDeck({ reach, initialLeads }: { reach: Reach; initialLeads: Lead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [exitDir, setExitDir] = useState<"left" | "right">("right");
  const [activity, setActivity] = useState<Activity[]>([]);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState("");

  const top = leads[0];

  const swipe = useCallback(
    (direction: "left" | "right") => {
      const lead = leads[0];
      if (!lead) return;
      setExitDir(direction);
      setLeads((prev) => prev.slice(1));

      // Right swipes take a few seconds (email lookup + AI draft); run in the background.
      if (direction === "right") {
        setActivity((a) => [{ id: lead.id, name: businessName(lead), state: "working" as const }, ...a].slice(0, 6));
      }
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
          setActivity((a) => a.map((x) => (x.id === lead.id ? { ...x, state, detail } : x)));
        })
        .catch((e) =>
          setActivity((a) => a.map((x) => (x.id === lead.id ? { ...x, state: "error", detail: String(e) } : x))),
        );
    },
    [leads],
  );

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
      <div className="relative h-[380px] w-full sm:h-[460px]">
        <AnimatePresence custom={exitDir}>
          {top ? (
            <Card key={top.id} lead={top} onSwipe={swipe} exitDir={exitDir} />
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="card absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="text-lg font-medium">{finding ? "Finding businesses…" : "You’re all caught up"}</div>
              <p className="mt-2 text-sm text-zinc-400">Load the next batch of businesses for you to swipe on.</p>
              <button onClick={findMore} disabled={finding} className="btn-primary mt-6">
                {finding ? "Searching…" : "Find more businesses"}
              </button>
              {findError && <p className="mt-3 text-sm text-amber-300">{findError}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {top && (
        <div className="mt-4 flex items-center gap-6 sm:mt-6">
          <button
            onClick={() => swipe("left")}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 text-2xl text-rose-400 sm:h-16 sm:w-16 hover:bg-rose-500/10"
            aria-label="No"
          >
            ✕
          </button>
          <span className="text-xs text-zinc-500">{leads.length} left · use ← →</span>
          <button
            onClick={() => swipe("right")}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 text-2xl text-emerald-400 sm:h-16 sm:w-16 hover:bg-emerald-500/10"
            aria-label="Yes"
          >
            ♥
          </button>
        </div>
      )}

      {activity.length > 0 && (
        <ul className="mt-8 w-full space-y-2">
          {activity.map((a) => (
            <li key={a.id} className="card flex items-center justify-between px-4 py-2 text-sm">
              <Link href={`/leads/${a.id}`} className="hover:underline">
                {a.name}
              </Link>
              <span
                className={
                  a.state === "working"
                    ? "text-zinc-400"
                    : a.state === "done"
                      ? "text-emerald-400"
                      : a.state === "no_email"
                        ? "text-amber-300"
                        : "text-rose-400"
                }
              >
                {a.state === "working" ? "Finding email & writing…" : a.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Card({
  lead,
  onSwipe,
  exitDir,
}: {
  lead: Lead;
  onSwipe: (d: "left" | "right") => void;
  exitDir: "left" | "right";
}) {
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
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const contact = lead.company ? [fullName(lead), lead.title].filter(Boolean).join(" · ") : lead.title;

  return (
    <motion.div
      className="card absolute inset-0 flex cursor-grab flex-col overflow-hidden bg-zinc-900 active:cursor-grabbing"
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
        className="absolute left-5 top-5 z-10 -rotate-12 rounded-lg border-2 border-emerald-400 px-3 py-1 text-lg font-bold text-emerald-400"
      >
        YES
      </motion.div>
      <motion.div
        style={{ opacity: nopeOpacity }}
        className="absolute right-5 top-5 z-10 rotate-12 rounded-lg border-2 border-rose-400 px-3 py-1 text-lg font-bold text-rose-400"
      >
        NO
      </motion.div>

      <div className="flex h-32 shrink-0 items-center justify-center sm:h-48 bg-gradient-to-br from-violet-600/40 via-fuchsia-500/20 to-transparent">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-black/30 text-2xl sm:h-28 sm:w-28 sm:text-3xl font-semibold">
          {initials || "?"}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h2 className="text-xl font-semibold sm:text-2xl">{name}</h2>
        {lead.industry && <p className="mt-1 text-zinc-300">{lead.industry}</p>}
        {contact && <p className="mt-3 text-sm text-zinc-400">Contact: {contact}</p>}
        <div className="mt-auto flex flex-wrap gap-2 text-xs">
          {lead.location && <span className="rounded-full bg-white/5 px-3 py-1 text-zinc-300">{lead.location}</span>}
          {lead.company_domain && (
            <span className="rounded-full bg-white/5 px-3 py-1 text-zinc-300">{lead.company_domain}</span>
          )}
          {lead.linkedin_url && (
            <a
              href={lead.linkedin_url}
              target="_blank"
              rel="noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-300 hover:bg-sky-500/25"
            >
              LinkedIn ↗
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
