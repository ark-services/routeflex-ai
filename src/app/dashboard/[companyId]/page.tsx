import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/actions";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS enforces this — if the user isn't a member, the query returns nothing
  const { data: membership } = await supabase
    .from("company_members")
    .select("role, companies(id, name)")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/");

  const company = membership.companies as unknown as {
    id: string;
    name: string;
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Role: {membership.role}
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Signed in as {user.email}
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/"
            className="text-sm text-zinc-500 underline hover:text-zinc-700"
          >
            Switch company
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-zinc-500 underline hover:text-zinc-700"
            >
              Log out
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
