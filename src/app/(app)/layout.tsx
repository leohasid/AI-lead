import Link from "next/link";
import { redirect } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import { requireUser } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types";

const NAV = [
  ["/swipe", "Swipe"],
  ["/pipeline", "Pipeline"],
  ["/campaigns", "Campaigns"],
] as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Link href="/swipe" className="font-semibold">
            Lead<span className="text-violet-400">Swipe</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-white/5">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell userId={user.id} initial={(notifications ?? []) as Notification[]} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
