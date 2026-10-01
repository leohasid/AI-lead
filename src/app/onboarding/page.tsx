import { redirect } from "next/navigation";
import OnboardingForm from "@/components/OnboardingForm";
import { isOnboarded } from "@/lib/profile";
import { requireUser } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  if (isOnboarded(user)) redirect("/swipe");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-12">
      <OnboardingForm />
    </main>
  );
}
