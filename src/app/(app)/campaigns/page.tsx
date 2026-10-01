import Link from "next/link";
import CampaignForm from "@/components/CampaignForm";
import { apolloEnabled } from "@/lib/apollo";
import { requireUser } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/types";

export default async function CampaignsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
  const campaigns = (data ?? []) as Campaign[];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Campaigns</h1>
        {!apolloEnabled() && (
          <p className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
            Demo mode: no <code>APOLLO_API_KEY</code> set, so campaigns use sample leads.
          </p>
        )}
        {campaigns.length === 0 ? (
          <p className="text-sm text-zinc-400">No campaigns yet. Create one to start finding leads.</p>
        ) : (
          <ul className="space-y-3">
            {campaigns.map((c) => (
              <li key={c.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{c.name}</div>
                  <Link href={`/swipe?c=${c.id}`} className="btn-ghost py-1">
                    Swipe →
                  </Link>
                </div>
                <p className="mt-1 text-sm text-zinc-400">
                  {[c.titles.join(", "), c.locations.join(", ")].filter(Boolean).join(" · ") || "Any title, any location"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card p-6">
        <h2 className="mb-4 font-semibold">New campaign</h2>
        <CampaignForm />
      </section>
    </div>
  );
}
