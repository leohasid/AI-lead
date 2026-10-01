"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

// Live bell: new rows in `notifications` arrive over Supabase Realtime.
export default function NotificationBell({ userId, initial }: { userId: string; initial: Notification[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `owner_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev]);
          setToast(n);
          setTimeout(() => setToast(null), 6000);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function toggle() {
    setOpen((o) => !o);
    if (!open && unread > 0) {
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      await fetch("/api/notifications/read", { method: "POST" });
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="relative rounded-lg p-2 hover:bg-white/5" aria-label="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="card absolute right-0 top-11 w-80 overflow-hidden bg-zinc-950 shadow-2xl">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-zinc-400">No notifications yet. You&apos;ll be pinged when leads reply.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.lead_id ? `/leads/${n.lead_id}` : "/pipeline"}
                    onClick={() => setOpen(false)}
                    className="block p-3 hover:bg-white/5"
                  >
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && <div className="mt-0.5 text-xs text-zinc-400">{n.body}</div>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {toast && (
        <Link
          href={toast.lead_id ? `/leads/${toast.lead_id}` : "/pipeline"}
          className="card fixed bottom-6 right-6 z-50 block w-80 bg-zinc-900 p-4 shadow-2xl"
        >
          <div className="font-medium">{toast.title}</div>
          {toast.body && <div className="mt-1 text-sm text-zinc-400">{toast.body}</div>}
        </Link>
      )}
    </div>
  );
}
