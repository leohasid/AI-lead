"use client";

import { ExternalLink, Globe, Map as MapIcon, MapPin, Phone, Sparkles, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Insight } from "@/lib/profile";
import type { Lead } from "@/lib/types";
import type { WebsiteInfo } from "@/lib/website";

// Full-screen sheet with everything known about one business, opened from its card.
export default function LeadDetails({ lead, insight, onClose }: { lead: Lead; insight: Insight; onClose: () => void }) {
  // undefined = still reading the website, null = nothing could be read
  const [website, setWebsite] = useState<WebsiteInfo | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    fetch(`/api/leads/${lead.id}/details`)
      .then((res) => (res.ok ? res.json() : { website: null }))
      .then((json) => current && setWebsite(json.website ?? null))
      .catch(() => current && setWebsite(null));
    return () => {
      current = false;
    };
  }, [lead.id]);

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

        <section className="mt-4 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
            <Sparkles size={16} className="fill-violet-400" />
            Why this lead?
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-100">{insight.why}</p>
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

        <section className="mt-5">
          <h3 className="label">What they do</h3>
          {website === undefined ? (
            <p className="flex items-center gap-2 text-sm text-zinc-400" role="status">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
              Reading their website…
            </p>
          ) : website && (website.description || website.about.length) ? (
            <div className="space-y-3 text-sm leading-relaxed text-zinc-200">
              {website.description && <p className="font-medium text-white">{website.description}</p>}
              {website.about
                .filter((p) => p !== website.description)
                .map((p) => (
                  <p key={p}>{p}</p>
                ))}
              <p className="text-xs text-zinc-500">From {lead.company_domain}, in their own words.</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              {lead.company_domain
                ? "Their website didn't give a description we could read. Open it to see what they do."
                : "No website on record for this business."}
            </p>
          )}
        </section>

        {website && website.socials.length > 0 && (
          <section className="mt-5">
            <h3 className="label">Social media</h3>
            <div className="flex flex-wrap gap-2">
              {website.socials.map((s) => (
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
