import { Building2, CircleAlert, CircleCheck, MapPin, Target } from "lucide-react";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { aiStatus } from "@/lib/ai";
import { apolloEnabled } from "@/lib/apollo";
import { categoryLabels } from "@/lib/categories";
import { emailEnabled } from "@/lib/email";
import { googleEnabled } from "@/lib/google";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";

export default async function MorePage() {
  const { supabase, user } = await requireUser();
  const profile = getProfile(user!);
  const [{ data }, ai] = await Promise.all([supabase.from("leads").select("status").neq("status", "new"), aiStatus()]);
  // What this copy of the app is actually connected to. Keys are set per environment, so the live site can differ from a local one.
  const connections = [
    ["AI (Claude)", ai.ok, ai.detail],
    ["Google Places", googleEnabled(), googleEnabled() ? "Fast business search with ratings" : "GOOGLE_PLACES_API_KEY is not set, so the slower free map search is used"],
    ["Apollo", apolloEnabled(), apolloEnabled() ? "Named decision-makers and verified emails" : "Optional. Not set, so contact emails come from business websites"],
    ["Email sending", emailEnabled(), emailEnabled() ? "Emails are sent through Resend" : "RESEND_API_KEY is not set, so sending is simulated"],
  ] as const;
  const statuses = (data ?? []).map((r) => r.status as string);
  const stats = [
    ["Swiped", statuses.length],
    ["Said yes", statuses.filter((s) => s !== "rejected").length],
    ["Interested", statuses.filter((s) => s === "interested").length],
  ] as const;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">More</h1>

      <section className="grid grid-cols-3 gap-2">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <div className="text-2xl font-bold">{n}</div>
            <div className="text-xs text-zinc-400">{label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Your business</h2>
          <Link href="/onboarding?edit=1" className="text-sm text-violet-400 hover:underline">
            Edit
          </Link>
        </div>
        <dl className="mt-3 space-y-3 text-sm">
          {(
            [
              [Building2, "What you do", profile.business],
              [MapPin, "Based in", profile.location],
              [Target, "Targeting", [...categoryLabels(profile.types), profile.target].filter(Boolean).join(", ") || "Any business"],
            ] as const
          ).map(([Icon, label, value]) => (
            <div key={label} className="flex gap-3">
              <Icon size={18} className="mt-0.5 shrink-0 text-violet-400" />
              <div>
                <dt className="text-xs text-zinc-400">{label}</dt>
                <dd className="text-zinc-200">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-semibold">Connections</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {connections.map(([name, on, detail]) => (
            <li key={name} className="flex gap-3">
              {on ? (
                <CircleCheck size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              ) : (
                <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-300" />
              )}
              <div>
                <div className="text-zinc-200">
                  {name} <span className={on ? "text-emerald-400" : "text-amber-300"}>{on ? "on" : "off"}</span>
                </div>
                <div className="text-xs text-zinc-400">{detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-xs text-zinc-400">Signed in as</div>
        <div className="mt-0.5 font-medium">{user!.email}</div>
        <SignOutButton />
      </section>
    </div>
  );
}
