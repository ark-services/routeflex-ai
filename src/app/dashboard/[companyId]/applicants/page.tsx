import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Applicant } from "@/lib/types";

export default async function ApplicantsPage({
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

  const { data: applicants } = await supabase
    .from("applicants")
    .select("*, jobs(title)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const rows = (applicants ?? []) as (Applicant & {
    jobs: { title: string };
  })[];

  const statusColor: Record<string, string> = {
    applied: "bg-blue-100 text-blue-700",
    reviewing: "bg-amber-100 text-amber-700",
    interviewing: "bg-purple-100 text-purple-700",
    offer: "bg-emerald-100 text-emerald-700",
    hired: "bg-green-100 text-green-700",
    rejected: "bg-stone-100 text-stone-500",
  };

  return (
    <>
      <Header companyName={company.name} companyId={companyId} />

      <section className="space-y-10 pb-16">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            Applicants
          </h1>
          <p className="text-stone-500">{company.name}</p>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-stone-400">No applicants yet.</p>
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
                    Job
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Email
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Phone
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Status
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                    Applied
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((applicant) => (
                  <tr
                    key={applicant.id}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="px-5 py-3.5 font-medium text-stone-900">
                      {applicant.full_name}
                    </td>
                    <td className="px-5 py-3.5 text-stone-500">
                      {applicant.jobs.title}
                    </td>
                    <td className="px-5 py-3.5 text-stone-500">
                      {applicant.email}
                    </td>
                    <td className="px-5 py-3.5 text-stone-500">
                      {applicant.phone}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[applicant.status] ?? ""}`}
                      >
                        {applicant.status.charAt(0).toUpperCase() +
                          applicant.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-stone-500">
                      {new Date(applicant.created_at).toLocaleDateString()}
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
