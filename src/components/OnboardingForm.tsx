"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    // Saved on the auth user, so no extra table is needed.
    const { error } = await createClient().auth.updateUser({
      data: {
        business: String(f.get("business") ?? "").trim(),
        target: String(f.get("target") ?? "").trim(),
        location: String(f.get("location") ?? "").trim(),
      },
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    router.replace("/swipe");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-lg space-y-5 p-6 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Tell us about your business</h1>
        <p className="mt-1 text-sm text-zinc-400">We use this to find the right leads and write your emails.</p>
      </div>
      <div>
        <label className="label">What does your business do?</label>
        <textarea
          name="business"
          required
          minLength={10}
          rows={4}
          className="input"
          placeholder="We run Google & Meta ads for dental clinics. Typical client gets 20-40 new patient bookings a month."
        />
      </div>
      <div>
        <label className="label">Where is your business based?</label>
        <input name="location" required className="input" placeholder="Manchester, UK" />
        <p className="mt-1 text-xs text-zinc-500">Town or city, then country. Used for the Local filter.</p>
      </div>
      <div>
        <label className="label">
          Any types of businesses you want to target? <span className="text-zinc-500">(optional)</span>
        </label>
        <textarea
          name="target"
          rows={3}
          className="input"
          placeholder="Dental clinics, physiotherapists, private gyms"
        />
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
