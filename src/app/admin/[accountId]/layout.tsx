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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Header companyName={membership.account.name} />
        {/*
          On mobile: flex-col → AdminSidebar horizontal tab bar on top, main below.
          On desktop: flex-row → AdminSidebar vertical aside on left, main beside.
        */}
        <div className="flex flex-col md:flex-row gap-0 md:gap-8 pb-16">
          <AdminSidebar accountId={accountId} />
          <main className="flex-1 min-w-0 pt-4 md:pt-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
