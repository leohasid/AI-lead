import { Building2, MapPin, Target } from "lucide-react";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { categoryLabels } from "@/lib/categories";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";

export default async function MorePage() {
  const { supabase, user } = await requireUser();
  const profile = getProfile(user!);
  const { data } = await supabase.from("leads").select("status").neq("status", "new");
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
        <div className="text-xs text-zinc-400">Signed in as</div>
        <div className="mt-0.5 font-medium">{user!.email}</div>
        <SignOutButton />
      </section>
    </div>
  );
}
