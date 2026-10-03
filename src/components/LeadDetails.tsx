"use client";

import { ExternalLink, Globe, Map as MapIcon, MapPin, Phone, Sparkles, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Insight } from "@/lib/profile";
import type { Lead } from "@/lib/types";
import type { FullBrief } from "@/lib/ai";
import type { WebsiteInfo } from "@/lib/website";

// Full-screen sheet with everything known about one business, opened from its card.
export default function LeadDetails({ lead, insight, onClose }: { lead: Lead; insight: Insight; onClose: () => void }) {
  // The business's website is read only for the social profiles it links to;
  // what they do is AI's short summary (insight.about), never their own copy.
  const [socials, setSocials] = useState<WebsiteInfo["socials"]>([]);

  useEffect(() => {
    if (!lead.company_domain) return;
    let current = true;
    fetch(`/api/leads/${lead.id}/details`)
      .then((res) => (res.ok ? res.json() : { website: null }))
      .then((json) => current && setSocials(json.website?.socials ?? []))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [lead.id, lead.company_domain]);

  // "Show more": AI's fuller write-up, fetched only when asked for.
  // "idle" = not asked, "loading" = being written, null = AI couldn't write one
  const [brief, setBrief] = useState<FullBrief | null | "idle" | "loading">("idle");

  function showMore() {
    setBrief("loading");
    fetch(`/api/leads/${lead.id}/details?full=1`)
      .then((res) => (res.ok ? res.json() : { brief: null }))
      .then((json) => setBrief(json.brief ?? null))
      .catch(() => setBrief(null));
  }

  const name = lead.company ?? [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const person = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  // Google leads carry "4.9★ (765 reviews) · 0161 273 3330" in the headline; map leads just a phone number.
  const [, rating, phoneAfterRating] = lead.headline?.match(/^(\d\.\d★ \(\d+ reviews\))(?: · (.+))?$/) ?? [];
  const phone = rating ? phoneAfterRating : !person ? lead.headline : null;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${lead.location ?? ""}`)}`;

  // On <body>, so nothing on the page (bottom bar, card animations) can sit on top of it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`About ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-[#14112a] p-5 sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold leading-tight">{name}</h2>
            {lead.industry && <p className="mt-1 text-sm text-violet-300">{lead.industry}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-2 text-zinc-400 hover:bg-white/5">
            <X size={20} />
          </button>
        </div>

        {/* The one-line version; hidden once the fuller write-up below is showing. */}
        {insight.about && !(brief && typeof brief === "object") && (
          <section className="mt-4">
            <h3 className="label">What they do</h3>
            <p className="text-sm leading-relaxed text-zinc-100">{insight.about}</p>
          </section>
        )}

        <section className="mt-4 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
            <Sparkles size={16} className="fill-violet-400" />
            {insight.points.length ? "Services you could offer them" : "Why this lead?"}
          </div>
          {insight.points.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-sm leading-snug text-zinc-100">
              {insight.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="text-violet-400">•</span>
                  {p}
                </li>
              ))}
            </ul>
          )}
          <p className={`text-sm leading-relaxed ${insight.points.length ? "mt-2.5 border-t border-white/10 pt-2.5 text-zinc-300" : "mt-1 text-zinc-100"}`}>
            {insight.why}
          </p>

          {brief === "idle" ? (
            <button type="button" onClick={showMore} className="btn-primary mt-3 w-full">
              Show more
            </button>
          ) : brief === "loading" ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-zinc-300" role="status">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
              Writing a fuller summary…
            </p>
          ) : brief ? (
            <div className="mt-3 space-y-3 border-t border-white/10 pt-3 text-sm leading-relaxed">
              <div>
                <h3 className="label">What they do</h3>
                <p className="text-zinc-100">{brief.about}</p>
              </div>
              <div>
                <h3 className="label">How you could help</h3>
                <ul className="space-y-2">
                  {brief.help.map((h) => (
                    <li key={h.service}>
                      <span className="font-medium text-white">{h.service}.</span> <span className="text-zinc-300">{h.how}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-200">The fuller AI summary isn&apos;t available right now.</p>
          )}
        </section>

        <dl className="mt-4 space-y-2.5 text-sm text-zinc-200">
          {person && (
            <Row Icon={Sparkles}>
              {person}
              {lead.title && <span className="text-zinc-400"> · {lead.title}</span>}
            </Row>
          )}
          {rating && <Row Icon={Star}>{rating} on Google</Row>}
          {lead.location && <Row Icon={MapPin}>{lead.location}</Row>}
          {phone && (
            <Row Icon={Phone}>
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="underline decoration-white/20">
                {phone}
              </a>
            </Row>
          )}
          {lead.company_domain && (
            <Row Icon={Globe}>
              <a href={`https://${lead.company_domain}`} target="_blank" rel="noreferrer" className="underline decoration-white/20">
                {lead.company_domain}
              </a>
            </Row>
          )}
        </dl>

        {socials.length > 0 && (
          <section className="mt-5">
            <h3 className="label">Social media</h3>
            <div className="flex flex-wrap gap-2">
              {socials.map((s) => (
                <a
                  key={s.name}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/5"
                >
                  {s.name}
                  <ExternalLink size={13} className="text-zinc-400" />
                </a>
              ))}
            </div>
          </section>
        )}

        <div className="mt-5 flex gap-3">
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn-ghost flex-1">
            <MapIcon size={16} />
            Google Maps
          </a>
          {lead.company_domain && (
            <a href={`https://${lead.company_domain}`} target="_blank" rel="noreferrer" className="btn-primary flex-1">
              <ExternalLink size={16} />
              Visit website
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ Icon, children }: { Icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} className="mt-0.5 shrink-0 text-zinc-400" />
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
