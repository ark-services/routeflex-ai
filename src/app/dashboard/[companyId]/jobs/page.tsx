import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addJob } from "./actions";
import { NewJobForm } from "./new-job-form";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Job } from "@/lib/types";

export default async function JobsPage({
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

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const rows = (jobs ?? []) as Job[];

  const statusColor: Record<string, string> = {
    open: "bg-emerald-100 text-emerald-700",
    paused: "bg-amber-100 text-amber-700",
    closed: "bg-stone-100 text-stone-500",
  };

  return (
    <>
      <Header companyName={company.name} companyId={companyId} />

      <section className="space-y-10 pb-16">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
              Jobs
            </h1>
            <p className="text-stone-500">{company.name}</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {canEdit && <NewJobForm companyId={companyId} action={addJob} />}

        {rows.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-stone-400">No jobs yet.</p>
          </div>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200/60 text-left">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Title
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Location
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Terminal
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="px-5 py-3.5 font-medium text-stone-900">
                      {job.title}
                    </td>
                    <td className="px-5 py-3.5 text-stone-500">
                      {job.location || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-stone-500">
                      {job.terminal || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[job.status] ?? ""}`}
                      >
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </span>
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
