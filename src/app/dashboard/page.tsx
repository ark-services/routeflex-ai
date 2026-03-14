import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/(auth)/actions";
import { reactivateAccount } from "@/app/profile/actions";

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch companies the user can access via account membership
  const { data: accountMemberships, error: membershipError } = await supabase
    .from("account_memberships")
    .select("account_id, role")
    .eq("user_id", user.id);

  if (membershipError) {
    console.error("Error fetching account memberships", membershipError);
  }

  const accountIds = (accountMemberships ?? []).map((m) => m.account_id);

  // Check if any account needs onboarding
  if (accountIds.length > 0) {
    const adminAccountIds = (accountMemberships ?? [])
      .filter((m) => m.role === "admin" || m.role === "owner")
      .map((m) => m.account_id);

    if (adminAccountIds.length > 0) {
      const { data: needsOnboarding } = await supabase
        .from("accounts")
        .select("id")
        .in("id", adminAccountIds)
        .eq("onboarding_completed", false)
        .limit(1);

      if (needsOnboarding && needsOnboarding.length > 0) {
        redirect("/onboard");
      }
    }

    // Check if any account is deactivated
    const serviceSupabase = createServiceClient();
    const { data: deactivatedAccounts } = await serviceSupabase
      .from("accounts")
      .select("id")
      .in("id", accountIds)
      .not("deactivated_at", "is", null)
      .limit(1);

    if (deactivatedAccounts && deactivatedAccounts.length > 0) {
      return (
        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          <Header />
          <section className="py-16 sm:py-24">
            <div className="mx-auto max-w-md text-center space-y-4">
              <h1 className="text-3xl font-semibold tracking-tight text-rf-text-primary">
                Account Deactivated
              </h1>
              <p className="text-rf-text-secondary leading-relaxed">
                Your account has been deactivated. You can reactivate it to
                regain access to your dashboard and data.
              </p>
              <p className="text-sm text-rf-text-muted">Signed in as {user.email}</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <form action={reactivateAccount}>
                  <Button variant="secondary">Reactivate Account</Button>
                </form>
                <form action={logout}>
                  <Button variant="tertiary">Log out</Button>
                </form>
              </div>
            </div>
          </section>
        </div>
      );
    }
  }

  // If the user has no account memberships, they cannot access any companies.
  // Avoid querying `companies` with a dummy UUID, which can interact poorly with RLS.
  if (accountIds.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <Header />
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-md text-center space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-rf-text-primary">
              No access
            </h1>
            <p className="text-rf-text-secondary leading-relaxed">
              You do not have access to any company yet. Please ask an account
              administrator to add you.
            </p>
            <p className="text-sm text-rf-text-muted">Signed in as {user.email}</p>
            <form action={logout} className="pt-2">
              <Button variant="secondary">Log out</Button>
            </form>
          </div>
        </section>
      </div>
    );
  }

  const { data: companiesData, error: companiesError } = await supabase
    .from("companies")
    .select("id, name, account_id")
    .in("account_id", accountIds);

  if (companiesError) {
    console.error("Error fetching companies", companiesError);
  }

  // Role is account-scoped in v1; use the membership role for all companies in that account
  const roleByAccount = new Map(
    (accountMemberships ?? []).map((m) => [m.account_id, m.role] as const)
  );

  const companies = (companiesData ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    role: roleByAccount.get(c.account_id as string) ?? "member",
  }));

  // Auto-redirect if exactly one company
  if (companies.length === 1) {
    redirect(`/dashboard/${companies[0].id}`);
  }

  // Zero companies — no access
  if (companies.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <Header />
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-md text-center space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-rf-text-primary">
              No access
            </h1>
            <p className="text-rf-text-secondary leading-relaxed">
              You do not have access to any company yet. Please ask an account
              administrator to add you.
            </p>
            <p className="text-sm text-rf-text-muted">Signed in as {user.email}</p>
            <form action={logout} className="pt-2">
              <Button variant="secondary">Log out</Button>
            </form>
          </div>
        </section>
      </div>
    );
  }

  // Multiple companies — show selector
  return (
    <div className="mx-auto max-w-5xl px-6 sm:px-8">
      <Header />
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-md space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-rf-text-primary">
              Select a company
            </h1>
            <p className="text-rf-text-secondary">Signed in as {user.email}</p>
          </div>
          <ul className="space-y-3">
            {companies.map((company) => (
              <li key={company.id}>
                <Link href={`/dashboard/${company.id}`}>
                  <Card className="flex items-center justify-between px-5 py-4 hover:shadow-md transition-shadow cursor-pointer">
                    <span className="text-sm font-medium text-rf-text-primary">
                      {company.name}
                    </span>
                    <Badge>{company.role}</Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
