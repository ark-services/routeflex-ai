import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/actions";
import { addCandidate, updateCandidateStage } from "./actions";
import { StageSelect } from "./stage-select";
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
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          <p className="text-sm text-zinc-500">
            {user.email} &middot; {membership.role}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Link
            href="/"
            className="text-sm text-zinc-500 underline hover:text-zinc-700"
          >
            Switch
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
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* Add candidate form — owners/admins only */}
      {canEdit && (
        <form action={addCandidate} className="border rounded p-4 space-y-3">
          <h2 className="text-sm font-semibold">Add candidate</h2>
          <input type="hidden" name="companyId" value={companyId} />
          <div className="grid grid-cols-2 gap-3">
            <input
              name="firstName"
              placeholder="First name"
              required
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              name="lastName"
              placeholder="Last name"
              required
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              name="email"
              type="email"
              placeholder="Email (optional)"
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              name="phone"
              placeholder="Phone (optional)"
              className="rounded border px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Add
          </button>
        </form>
      )}

      {/* Candidates table */}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-12">
          No candidates yet.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Phone</th>
              <th className="pb-2 font-medium">Stage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-2">
                  {c.first_name} {c.last_name}
                </td>
                <td className="py-2 text-zinc-500">{c.email ?? "—"}</td>
                <td className="py-2 text-zinc-500">{c.phone ?? "—"}</td>
                <td className="py-2">
                  {canEdit ? (
                    <StageSelect
                      companyId={companyId}
                      candidateId={c.id}
                      currentStage={c.stage}
                      action={updateCandidateStage}
                    />
                  ) : (
                    c.stage
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
