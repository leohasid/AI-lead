import { User } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import Logo from "@/components/Logo";
import NotificationBell from "@/components/NotificationBell";
import { isOnboarded } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  // First sign-in: ask what the business does before anything else.
  if (!isOnboarded(user)) redirect("/onboarding");

  const [{ data: notifications }, { count: matches }, { count: messages }] = await Promise.all([
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(20),
    // Drafts waiting for review.
    supabase.from("leads").select("id", { count: "exact", head: true }).in("status", ["approved", "drafted"]),
    // Conversations where the lead has written back.
    supabase.from("leads").select("id", { count: "exact", head: true }).in("status", ["replied", "interested"]),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-3">
          <Logo />
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell userId={user.id} initial={(notifications ?? []) as Notification[]} />
            <Link
              href="/more"
              aria-label="Account"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-zinc-200 hover:bg-white/5"
            >
              <User size={20} />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-2">{children}</main>
      <BottomNav matches={matches ?? 0} messages={messages ?? 0} />
    </div>
  );
}
