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
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-sm font-semibold text-stone-900">Super Admin</span>
        </div>
        <nav className="flex items-center gap-4 ml-4">
          <Link
            href="/super-admin/templates"
            className="text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            Templates
          </Link>
        </nav>
        <div className="ml-auto">
          <Link
            href="/"
            className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
          >
            ← Back to App
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
