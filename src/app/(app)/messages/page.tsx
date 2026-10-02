import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { STATUS_LABEL, type Lead } from "@/lib/types";

// Conversations: every lead you've emailed, newest activity first.
export default async function MessagesPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .in("status", ["contacted", "replied", "interested", "not_interested"])
    .order("updated_at", { ascending: false })
    .limit(200);
  const leads = (data ?? []) as Lead[];

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-bold">Messages</h1>
      {leads.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <MessageCircle size={32} className="text-violet-400" />
          <p className="mt-3 font-medium">No conversations yet</p>
          <p className="mt-1 text-sm text-zinc-400">Once you email a business, the conversation shows up here.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {leads.map((l) => {
            const hot = l.status === "interested" || l.status === "replied";
            return (
              <li key={l.id}>
                <Link
                  href={`/leads/${l.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 font-bold">
                    {(l.company ?? l.first_name ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{l.company ?? [l.first_name, l.last_name].join(" ")}</span>
                      <span className={`shrink-0 text-xs ${hot ? "text-emerald-400" : "text-zinc-500"}`}>
                        {STATUS_LABEL[l.status]}
                      </span>
                    </span>
                    <span className="block truncate text-sm text-zinc-400">
                      {l.ai_summary ?? [l.first_name, l.last_name].filter(Boolean).join(" ")}
                    </span>
                  </span>
                  {hot && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
