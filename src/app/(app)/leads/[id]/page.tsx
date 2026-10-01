import Link from "next/link";
import { notFound } from "next/navigation";
import LeadConversation from "@/components/LeadConversation";
import { emailEnabled } from "@/lib/email";
import { requireUser } from "@/lib/supabase/server";
import { STATUS_LABEL, type Lead, type Message } from "@/lib/types";

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: lead }, { data: messages }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase.from("messages").select("*").eq("lead_id", id).order("created_at"),
  ]);
  if (!lead) notFound();
  const l = lead as Lead;

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <aside className="card h-fit p-6">
        <Link href="/pipeline" className="text-xs text-zinc-400 hover:underline">
          ← Pipeline
        </Link>
        <h1 className="mt-3 text-xl font-semibold">{[l.first_name, l.last_name].filter(Boolean).join(" ")}</h1>
        <p className="text-sm text-zinc-300">
          {l.title}
          {l.company && ` · ${l.company}`}
        </p>
        <span className="mt-3 inline-block rounded-full bg-violet-500/15 px-3 py-1 text-xs text-violet-200">
          {STATUS_LABEL[l.status]}
        </span>
        <dl className="mt-6 space-y-3 text-sm">
          {(
            [
              ["Email", l.email],
              ["Location", l.location],
              ["Industry", l.industry],
              ["Website", l.company_domain],
            ] as const
          ).map(([k, v]) =>
            v ? (
              <div key={k}>
                <dt className="label">{k}</dt>
                <dd className="break-all text-zinc-200">{v}</dd>
              </div>
            ) : null,
          )}
          {l.linkedin_url && (
            <a href={l.linkedin_url} target="_blank" rel="noreferrer" className="btn-ghost w-full">
              Open LinkedIn ↗
            </a>
          )}
        </dl>
        {l.ai_summary && (
          <div className="mt-6 rounded-xl bg-white/5 p-3 text-sm">
            <div className="label">AI read</div>
            {l.ai_summary}
          </div>
        )}
      </aside>
      <LeadConversation lead={l} messages={(messages ?? []) as Message[]} canSimulate={!emailEnabled() || process.env.NODE_ENV !== "production"} />
    </div>
  );
}
