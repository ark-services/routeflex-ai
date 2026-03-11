import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import Link from "next/link";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-rf-surface-page">
      <header className="border-b border-rf-border bg-rf-surface-card px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-rf-danger" />
          <span className="text-sm font-semibold text-rf-text-primary">Super Admin</span>
        </div>
        <nav className="flex items-center gap-4 ml-4">
          <Link
            href="/super-admin/templates"
            className="text-sm text-rf-ink-500 hover:text-rf-text-primary transition-colors"
          >
            Templates
          </Link>
          <Link
            href="/super-admin/training/templates"
            className="text-sm text-rf-ink-500 hover:text-rf-text-primary transition-colors"
          >
            Training
          </Link>
          <Link
            href="/super-admin/accounts"
            className="text-sm text-rf-ink-500 hover:text-rf-text-primary transition-colors"
          >
            Accounts
          </Link>
          <Link
            href="/super-admin/waitlist"
            className="text-sm text-rf-ink-500 hover:text-rf-text-primary transition-colors"
          >
            Waitlist
          </Link>
        </nav>
        <div className="ml-auto">
          <Link
            href="/dashboard"
            className="text-sm text-rf-text-secondary hover:text-rf-ink-700 transition-colors"
          >
            ← Back to App
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
