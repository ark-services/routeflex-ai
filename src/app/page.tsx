import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./(auth)/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch companies the user belongs to
  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id, role, companies(id, name)")
    .eq("user_id", user.id);

  const companies = (memberships ?? []).map((m) => ({
    id: (m.companies as unknown as { id: string; name: string }).id,
    name: (m.companies as unknown as { id: string; name: string }).name,
    role: m.role,
  }));

  // Auto-redirect if exactly one company
  if (companies.length === 1) {
    redirect(`/dashboard/${companies[0].id}`);
  }

  // Zero companies — no access
  if (companies.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <main className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-semibold">No access</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You have not been invited to any company. Please ask an
            administrator to add you.
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Signed in as {user.email}
          </p>
          <form action={logout}>
            <button
              type="submit"
              className="rounded bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Log out
            </button>
          </form>
        </main>
      </div>
    );
  }

  // Multiple companies — show selector
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">
          Select a company
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
          Signed in as {user.email}
        </p>
        <ul className="space-y-2">
          {companies.map((company) => (
            <li key={company.id}>
              <Link
                href={`/dashboard/${company.id}`}
                className="flex items-center justify-between rounded border px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span>{company.name}</span>
                <span className="text-xs text-zinc-400">{company.role}</span>
              </Link>
            </li>
          ))}
        </ul>
        <form action={logout} className="text-center">
          <button
            type="submit"
            className="text-sm text-zinc-500 underline hover:text-zinc-700"
          >
            Log out
          </button>
        </form>
      </main>
    </div>
  );
}
