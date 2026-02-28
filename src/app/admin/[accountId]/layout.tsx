import { requireAdmin } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const membership = await requireAdmin(accountId);

  // Get user email for avatar (requireAdmin already validated the session)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Resolve the first company for this account so Back → Job Board
  const { data: companies } = await supabase
    .from("companies")
    .select("id")
    .eq("account_id", accountId)
    .limit(1);
  const firstCompanyId = companies?.[0]?.id ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-rf-surface-page">
      {/* Full-width sticky top bar */}
      <AdminHeader
        accountName={membership.account.name}
        accountId={accountId}
        userEmail={user?.email ?? ""}
        backHref={firstCompanyId ? `/dashboard/${firstCompanyId}` : "/"}
      />

      {/* Sidebar + content */}
      <div className="flex flex-col md:flex-row flex-1">
        <AdminSidebar accountId={accountId} />
        <main className="flex-1 min-w-0 px-6 py-8 max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  );
}
