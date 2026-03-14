import { requireAdmin } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { StandaloneShell } from "@/components/layout/standalone-shell";
import type { Company } from "@/lib/types";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  await requireAdmin(accountId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get all companies user has access to (same query as dashboard layout)
  const { data: accountMemberships } = await supabase
    .from("account_memberships")
    .select("account_id, role")
    .eq("user_id", user!.id);

  const accountIds = (accountMemberships ?? []).map((m) => m.account_id);

  const { data: companiesData } = await supabase
    .from("companies")
    .select("id, name, slug, account_id, lms_enabled, created_at")
    .in(
      "account_id",
      accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const companies = (companiesData ?? []) as Company[];
  const firstCompany = companies[0] ?? null;

  const roleByAccount = new Map(
    (accountMemberships ?? []).map((m) => [m.account_id, m.role] as const)
  );
  const userRole = roleByAccount.get(accountId as any) ?? "admin";
  const isAdmin = true; // requireAdmin already enforced this

  return (
    <StandaloneShell
      companies={companies}
      currentCompanyId={firstCompany?.id ?? ""}
      userEmail={user?.email ?? ""}
      accountId={accountId}
      userRole={userRole}
      isAdmin={isAdmin}
      canCreateCompany={isAdmin}
    >
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        <AdminSidebar accountId={accountId} companyId={firstCompany?.id ?? ""} />
        <main className="flex-1 min-w-0 px-6 py-8 max-w-5xl">
          {children}
        </main>
      </div>
    </StandaloneShell>
  );
}
