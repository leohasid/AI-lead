import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { STATUS_LABEL, type Lead, type LeadStatus } from "@/lib/types";

const COLUMNS: { status: LeadStatus[]; title: string; accent: string }[] = [
  { status: ["drafted", "approved"], title: "Draft ready", accent: "text-zinc-300" },
  { status: ["contacted"], title: "Contacted", accent: "text-sky-300" },
  { status: ["replied"], title: "Replied", accent: "text-amber-300" },
  { status: ["interested"], title: "Interested 🔥", accent: "text-emerald-300" },
  { status: ["not_interested", "no_email"], title: "Closed", accent: "text-zinc-500" },
];

export default async function PipelinePage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .not("status", "in", "(new,rejected)")
    .order("updated_at", { ascending: false })
    .limit(500);
  const leads = (data ?? []) as Lead[];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Pipeline</h1>
      <div className="grid gap-4 overflow-x-auto md:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = leads.filter((l) => col.status.includes(l.status));
          return (
            <section key={col.title} className="min-w-56">
              <h2 className={`mb-3 flex justify-between text-sm font-medium ${col.accent}`}>
                {col.title}
                <span className="text-zinc-500">{items.length}</span>
              </h2>
              <ul className="space-y-2">
                {items.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className="card block p-3 hover:bg-white/[0.06]">
                      <div className="text-sm font-medium">
                        {[l.first_name, l.last_name].filter(Boolean).join(" ")}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {l.title}
                        {l.company && ` · ${l.company}`}
                      </div>
                      {l.ai_summary && <p className="mt-2 text-xs text-zinc-300">{l.ai_summary}</p>}
                      {col.status.length > 1 && (
                        <div className="mt-2 text-[10px] uppercase tracking-wide text-zinc-500">
                          {STATUS_LABEL[l.status]}
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
