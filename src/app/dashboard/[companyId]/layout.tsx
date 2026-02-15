import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import type { Company, Job } from "@/lib/types";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get all companies user has access to
  const { data: accountMemberships } = await supabase
    .from("account_memberships")
    .select("account_id, role")
    .eq("user_id", user.id);

  const accountIds = (accountMemberships ?? []).map((m) => m.account_id);

  const { data: companiesData } = await supabase
    .from("companies")
    .select("id, name, slug, account_id, created_at")
    .in(
      "account_id",
      accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const companies = (companiesData ?? []) as Company[];

  // Verify user has access to current company
  const currentCompany = companies.find((c) => c.id === companyId);
  if (!currentCompany) redirect("/");

  // Get user's role for this company's account
  const roleByAccount = new Map(
    (accountMemberships ?? []).map((m) => [m.account_id, m.role] as const)
  );
  const userRole = roleByAccount.get(currentCompany.account_id as any) ?? "viewer";
  const isAdmin = userRole === "admin";
  const canCreateCompany = isAdmin;
  const canCreateJob = userRole !== "viewer";

  // Get jobs for current company
  const { data: jobsData } = await supabase
    .from("jobs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const jobs = (jobsData ?? []) as Job[];
  console.log("[DashboardLayout] Fetched", jobs.length, "jobs for company:", companyId);

  return (
    <AppShell
      companies={companies}
      currentCompanyId={companyId}
      jobs={jobs}
      userEmail={user.email || ""}
      accountId={currentCompany.account_id as string}
      userRole={userRole as string}
      isAdmin={isAdmin}
      canCreateCompany={canCreateCompany}
      canCreateJob={canCreateJob}
    >
      {children}
    </AppShell>
  );
}
