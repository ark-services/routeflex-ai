import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addCandidate, updateCandidateStage } from "./actions";
import { StageSelect } from "./stage-select";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Candidate } from "@/lib/types";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { companyId } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

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
  const canEdit = membership.role === "owner" || membership.role === "admin";

  const { data: candidates } = await supabase
    .from("candidates")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const rows = (candidates ?? []) as Candidate[];

  return (
    <>
      <Header companyName={company.name} companyId={companyId} />

      <section className="space-y-10 pb-16">
        {/* Page heading */}
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            {company.name}
          </h1>
          <p className="text-stone-500">
            {user.email} &middot; <Badge>{membership.role}</Badge>
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Add candidate form — owners/admins only */}
        {canEdit && (
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-stone-900">
              Add candidate
            </h2>
            <form action={addCandidate}>
              <input type="hidden" name="companyId" value={companyId} />
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Input name="firstName" placeholder="First name" required />
                <Input name="lastName" placeholder="Last name" required />
                <Input
                  name="email"
                  type="email"
                  placeholder="Email (optional)"
                />
                <Input name="phone" placeholder="Phone (optional)" />
              </div>
              <Button type="submit">Add candidate</Button>
            </form>
          </Card>
        )}

        {/* Candidates table */}
        {rows.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-stone-400">No candidates yet.</p>
          </div>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200/60 text-left">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Name
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Email
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Phone
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Stage
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="px-5 py-3.5 font-medium text-stone-900">
                      {c.first_name} {c.last_name}
                    </td>
                    <td className="px-5 py-3.5 text-stone-500">
                      {c.email ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-stone-500">
                      {c.phone ?? "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      {canEdit ? (
                        <StageSelect
                          companyId={companyId}
                          candidateId={c.id}
                          currentStage={c.stage}
                          action={updateCandidateStage}
                        />
                      ) : (
                        <Badge>{c.stage}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </>
  );
}
