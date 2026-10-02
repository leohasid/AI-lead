import { redirect } from "next/navigation";
import OnboardingForm from "@/components/OnboardingForm";
import { getProfile, isOnboarded } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { edit } = await searchParams;
  const { user } = await requireUser();
  if (!user) redirect("/login");
  // Asked once; after that only reachable from "Edit" on the More page.
  if (isOnboarded(user) && !edit) redirect("/swipe");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <OnboardingForm initial={getProfile(user)} editing={Boolean(edit)} />
    </main>
  );
}
