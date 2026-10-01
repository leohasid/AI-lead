"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SIZES = [
  ["1,10", "1–10"],
  ["11,50", "11–50"],
  ["51,200", "51–200"],
  ["201,500", "201–500"],
  ["501,1000", "501–1k"],
  ["1001,10000", "1k+"],
];

export default function CampaignForm({ defaultOffer = "", defaultKeywords = "" }: { defaultOffer?: string; defaultKeywords?: string }) {
  const router = useRouter();
  const [sizes, setSizes] = useState<string[]>(["1,10", "11,50"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        titles: f.get("titles"),
        locations: f.get("locations"),
        keywords: f.get("keywords"),
        employee_ranges: sizes,
        offer: f.get("offer"),
        sender_name: f.get("sender_name"),
        sender_email: f.get("sender_email"),
        signature: f.get("signature"),
        auto_send: f.get("auto_send") === "on",
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(json.error);
    }
    // Fill the deck right away so the user lands on cards.
    await fetch(`/api/campaigns/${json.id}/find-leads`, { method: "POST" });
    router.push(`/swipe?c=${json.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Campaign name</label>
        <input name="name" required className="input" placeholder="Dentists in Texas" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Job titles (comma separated)</label>
          <input name="titles" className="input" placeholder="Owner, Founder, Practice Manager" />
        </div>
        <div>
          <label className="label">Locations</label>
          <input name="locations" className="input" placeholder="Texas, US" />
        </div>
      </div>
      <div>
        <label className="label">Keywords</label>
        <input name="keywords" className="input" placeholder="dental clinic" defaultValue={defaultKeywords} />
      </div>
      <div>
        <label className="label">Company size</label>
        <div className="flex flex-wrap gap-2">
          {SIZES.map(([v, l]) => {
            const on = sizes.includes(v);
            return (
              <button
                type="button"
                key={v}
                onClick={() => setSizes((s) => (on ? s.filter((x) => x !== v) : [...s, v]))}
                className={`rounded-full border px-3 py-1 text-xs ${on ? "border-violet-400 bg-violet-500/20" : "border-white/10 text-zinc-400"}`}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="label">What do you offer?</label>
        <textarea
          name="offer"
          required
          rows={3}
          className="input"
          defaultValue={defaultOffer}
          placeholder="We run Google & Meta ads for dental clinics. Typical client gets 20-40 new patient bookings a month."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Sender name</label>
          <input name="sender_name" required className="input" placeholder="Alex Rivera" />
        </div>
        <div>
          <label className="label">Sender email</label>
          <input name="sender_email" type="email" required className="input" placeholder="alex@youragency.com" />
        </div>
      </div>
      <div>
        <label className="label">Signature (include your business address)</label>
        <textarea name="signature" rows={2} className="input" placeholder={"Rivera Growth Co.\n123 Main St, Austin TX"} />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="auto_send" className="accent-violet-500" />
        Send automatically when I swipe right (otherwise I review each draft first)
      </label>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Creating & finding leads…" : "Create campaign"}
      </button>
    </form>
  );
}
