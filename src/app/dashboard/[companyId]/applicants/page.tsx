import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// This route is deprecated. Redirect to the new route structure.
export default async function ApplicantsPageRedirect({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  // Get first job for this company
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1);

  // Redirect to new route structure
  if (jobs && jobs.length > 0) {
    redirect(`/dashboard/${companyId}/jobs/${jobs[0].id}/applicants`);
  } else {
    redirect(`/dashboard/${companyId}`);
  }
}