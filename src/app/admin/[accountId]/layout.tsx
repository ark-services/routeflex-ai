import { requireAdmin } from "@/lib/rbac";
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

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Full-width sticky top bar */}
      <AdminHeader
        accountName={membership.account.name}
        accountId={accountId}
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
