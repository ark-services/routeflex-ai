import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <>
        <Header />
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-md text-center space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
              No access
            </h1>
            <p className="text-stone-500 leading-relaxed">
              You have not been invited to any company. Please ask an
              administrator to add you.
            </p>
            <p className="text-sm text-stone-400">
              Signed in as {user.email}
            </p>
            <form action={logout} className="pt-2">
              <Button variant="secondary">Log out</Button>
            </form>
          </div>
        </section>
      </>
    );
  }

  // Multiple companies — show selector
  return (
    <>
      <Header />
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-md space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
              Select a company
            </h1>
            <p className="text-stone-500">Signed in as {user.email}</p>
          </div>
          <ul className="space-y-3">
            {companies.map((company) => (
              <li key={company.id}>
                <Link href={`/dashboard/${company.id}`}>
                  <Card className="flex items-center justify-between px-5 py-4 hover:shadow-md transition-shadow cursor-pointer">
                    <span className="text-sm font-medium text-stone-900">
                      {company.name}
                    </span>
                    <Badge>{company.role}</Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
