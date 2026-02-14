import { requireAdmin } from "@/lib/rbac";
import { Header } from "@/components/header";
import Link from "next/link";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const membership = await requireAdmin(accountId);

  const navLinks = [
    { href: `/admin/${accountId}`, label: "Overview" },
    { href: `/admin/${accountId}/users`, label: "Users" },
    { href: `/admin/${accountId}/automations`, label: "Automations" },
    { href: `/admin/${accountId}/integrations`, label: "Integrations" },
  ];

  return (
    <>
      <Header companyName={membership.account.name} />
      <section className="space-y-8 pb-16">
        <div className="border-b border-stone-200/60 pb-4">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 mb-4">Admin Center</h1>
          <nav className="flex gap-6">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm text-stone-500 hover:text-stone-900">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </section>
    </>
  );
}
