import { requireAdmin } from "@/lib/rbac";
import { Header } from "@/components/header";
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
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <Header companyName={membership.account.name} />
        <div className="flex gap-8 pb-16">
          <AdminSidebar accountId={accountId} />
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
