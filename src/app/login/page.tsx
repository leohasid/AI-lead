"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold">Sign in to LeadSwipe</h1>
        <p className="mt-1 text-sm text-zinc-400">We&apos;ll email you a sign-in link.</p>
        {!configured ? (
          <p className="mt-6 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-200">
            Supabase isn&apos;t connected yet. Copy <code>.env.example</code> to <code>.env.local</code>, add your
            Supabase URL and keys, and restart the dev server.
          </p>
        ) : state === "sent" ? (
          <p className="mt-6 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-300">
            Check <b>{email}</b> for your sign-in link.
          </p>
        ) : (
          <>
            <input
              type="email"
              required
              className="input mt-6"
              placeholder="you@agency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn-primary mt-3 w-full" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Email me a link"}
            </button>
            {state === "error" && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </>
        )}
      </form>
    </main>
  );
}
