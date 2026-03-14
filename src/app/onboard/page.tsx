import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingWizard from "./OnboardingWizard";

export default async function OnboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch user's account memberships
  const { data: memberships } = await supabase
    .from("account_memberships")
    .select("account_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    redirect("/dashboard");
  }

  // Find the first account the user is admin of that hasn't completed onboarding
  const accountIds = memberships.map((m) => m.account_id);

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, onboarding_completed")
    .in("id", accountIds)
    .eq("onboarding_completed", false)
    .limit(1);

  // If all accounts are onboarded, go to dashboard
  if (!accounts || accounts.length === 0) {
    redirect("/dashboard");
  }

  const accountId = accounts[0].id as string;

  // Fetch the company for this account
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .eq("account_id", accountId)
    .limit(1);

  if (!companies || companies.length === 0) {
    redirect("/dashboard");
  }

  const company = companies[0];

  return (
    <OnboardingWizard
      companyId={company.id as string}
      companyName={company.name as string}
      accountId={accountId}
    />
  );
}
