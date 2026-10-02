"use client";

import { BarChart3, Flame, Layers, MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav({ matches, messages }: { matches: number; messages: number }) {
  const path = usePathname();
  const items = [
    { href: "/swipe", label: "Discover", Icon: Flame, badge: 0, active: path.startsWith("/swipe") },
    { href: "/pipeline", label: "Matches", Icon: Layers, badge: matches, active: path.startsWith("/pipeline") },
    {
      href: "/messages",
      label: "Messages",
      Icon: MessageCircle,
      badge: messages,
      active: path.startsWith("/messages") || path.startsWith("/leads"),
    },
    { href: "/more", label: "More", Icon: BarChart3, badge: 0, active: path.startsWith("/more") },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0c0a1a]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md justify-around px-2 py-2">
        {items.map(({ href, label, Icon, badge, active }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex w-20 flex-col items-center gap-1 py-1 text-xs font-medium ${active ? "text-violet-400" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <span className="relative">
                <Icon size={24} className={active ? "fill-violet-500/80" : ""} />
                {badge > 0 && (
                  <span className="absolute -right-3 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-500 px-1 text-[11px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
