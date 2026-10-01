"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "working" | "confirm" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("working");
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return fail(error.message);
      router.replace("/swipe");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) return fail(error.message);
    // No session means Supabase wants the email confirmed first.
    if (data.session) router.replace("/swipe");
    else setState("confirm");
  }

  function fail(message: string) {
    setError(message);
    setState("error");
  }

  function switchMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    setState("idle");
    setError("");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold">{mode === "signin" ? "Sign in to LeadSwipe" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {mode === "signin" ? "Use your email and password." : "Pick a password with at least 6 characters."}
        </p>
        {!configured ? (
          <p className="mt-6 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-200">
            Supabase isn&apos;t connected yet. Copy <code>.env.example</code> to <code>.env.local</code>, add your
            Supabase URL and keys, and restart the dev server.
          </p>
        ) : state === "confirm" ? (
          <p className="mt-6 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-300">
            Account created. Check <b>{email}</b> to confirm it, then sign in.
          </p>
        ) : (
          <>
            <input
              type="email"
              required
              autoComplete="email"
              className="input mt-6"
              placeholder="you@agency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="input mt-3"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn-primary mt-3 w-full" disabled={state === "working"}>
              {state === "working" ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
            {state === "error" && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </>
        )}
        {configured && (
          <button type="button" onClick={switchMode} className="mt-4 w-full text-sm text-zinc-400 hover:text-zinc-200">
            {mode === "signin" ? "No account yet? Create one" : "Already have an account? Sign in"}
          </button>
        )}
      </form>
    </main>
  );
}
