import { redirect } from "next/navigation";
import OnboardingForm from "@/components/OnboardingForm";
import { requireUser } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const { user } = await requireUser();
  if (!user) redirect("/login");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <OnboardingForm />
    </main>
  );
}
