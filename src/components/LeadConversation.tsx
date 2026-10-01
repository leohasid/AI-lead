"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Lead, Message } from "@/lib/types";

export default function LeadConversation({
  lead,
  messages,
  canSimulate,
}: {
  lead: Lead;
  messages: Message[];
  canSimulate: boolean;
}) {
  const router = useRouter();
  const draft = messages.findLast((m) => m.status === "draft");
  const thread = messages.filter((m) => m.status !== "draft");
  const lastSubject = [...thread].reverse().find((m) => m.subject)?.subject;

  const [subject, setSubject] = useState(draft?.subject ?? (lastSubject ? `Re: ${lastSubject.replace(/^re:\s*/i, "")}` : ""));
  const [body, setBody] = useState(draft?.body ?? "");
  const [busy, setBusy] = useState<"" | "send" | "sim">("");
  const [error, setError] = useState("");
  const [simText, setSimText] = useState("Sounds interesting, can you send over pricing? Free for a call Thursday.");

  async function post(url: string, payload: unknown, kind: "send" | "sim") {
    setBusy(kind);
    setError("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy("");
    if (!res.ok) return setError(json.error ?? "Something went wrong");
    if (kind === "send") setBody("");
    router.refresh();
  }

  const canCompose = Boolean(lead.email) && lead.status !== "not_interested";

  return (
    <section className="flex flex-col gap-4">
      {thread.length === 0 && !draft && (
        <p className="text-sm text-zinc-400">No messages yet.</p>
      )}
      {thread.map((m) => (
        <article
          key={m.id}
          className={`card max-w-2xl p-4 ${m.direction === "outbound" ? "self-end border-violet-500/30 bg-violet-500/10" : ""}`}
        >
          <div className="mb-2 flex justify-between gap-4 text-xs text-zinc-400">
            <span>
              {m.direction === "outbound" ? "You" : lead.first_name ?? "Lead"}
              {m.subject && ` · ${m.subject}`}
            </span>
            <span>
              {m.status === "failed" ? "⚠ failed" : new Date(m.created_at).toLocaleString()}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{m.body}</p>
        </article>
      ))}

      {canCompose && (
        <div className="card p-4">
          <div className="label">{draft ? "AI draft, edit before sending" : "Write a follow-up"}</div>
          <input className="input mb-2" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          <textarea className="input" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button
              className="btn-primary"
              disabled={!body.trim() || busy !== ""}
              onClick={() => post(`/api/leads/${lead.id}/send`, { subject, body }, "send")}
            >
              {busy === "send" ? "Sending…" : `Send to ${lead.email}`}
            </button>
          </div>
        </div>
      )}

      {canSimulate && thread.some((m) => m.direction === "outbound") && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer text-zinc-400">Test: simulate a reply from this lead</summary>
          <textarea className="input mt-3" rows={3} value={simText} onChange={(e) => setSimText(e.target.value)} />
          <button
            className="btn-ghost mt-2"
            disabled={busy !== ""}
            onClick={() => post(`/api/leads/${lead.id}/simulate-reply`, { text: simText }, "sim")}
          >
            {busy === "sim" ? "AI is reading it…" : "Simulate reply"}
          </button>
        </details>
      )}
    </section>
  );
}
