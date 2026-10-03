"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { CATEGORIES } from "@/lib/categories";

// Header button that opens the "what kinds of business do you want?" sheet.
export default function FilterButton({
  types,
  other,
}: {
  types: string[];
  other: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(types);
  const [text, setText] = useState(other);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = types.length > 0 || other.length > 0;

  function show() {
    setChosen(types);
    setText(other);
    setError("");
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ types: chosen, other: text }),
    });
    setBusy(false);
    if (!res.ok)
      return setError((await res.json()).error ?? "Couldn't save your filters");
    setOpen(false);
    // A new address so the swipe screen shows its loading state while the deck refills.
    router.push(`/swipe?f=${Date.now()}`);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={show}
        aria-label={active ? "Business filters (on)" : "Business filters"}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-zinc-200 hover:bg-white/5"
      >
        <SlidersHorizontal size={22} />
        {active && (
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-violet-500 ring-2 ring-background" />
        )}
      </button>

      {/* On <body>: the header's backdrop blur would otherwise trap the sheet inside the header. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-label="Business filters"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-[#14112a] p-5 sm:rounded-3xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  What businesses do you want?
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-full p-2 text-zinc-400 hover:bg-white/5"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                Pick as many as you like. Leave everything empty to see all
                kinds.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = chosen.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setChosen((ids) =>
                          on ? ids.filter((id) => id !== c.id) : [...ids, c.id],
                        )
                      }
                      className={`rounded-full border px-3.5 py-2 text-sm ${on ? "border-violet-400 bg-violet-500/25 text-white" : "border-white/15 text-zinc-300"}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <label className="label mt-5" htmlFor="other-types">
                Other
              </label>
              <textarea
                id="other-types"
                rows={2}
                maxLength={200}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="input"
                placeholder="Describe anything else, e.g. wedding photographers, dog groomers, florists"
              />

              {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setChosen([]);
                    setText("");
                  }}
                  className="btn-ghost flex-1"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="btn-primary flex-[2]"
                >
                  {busy ? "Saving…" : "Show these businesses"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
