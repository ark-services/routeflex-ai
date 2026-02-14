import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// This page redirects to the first job's applicants board
// or shows a welcome message if no jobs exist
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  // Get user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get first job for this company
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1);

  // If we have a job, redirect to its applicants board
  if (jobs && jobs.length > 0) {
    redirect(`/dashboard/${companyId}/jobs/${jobs[0].id}/applicants`);
  }

  // No jobs - show welcome message in the app shell
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-4 max-w-md px-6">
        <h2 className="text-2xl font-semibold text-stone-900">
          Welcome to your dashboard
        </h2>
        <p className="text-stone-500">
          Get started by creating your first job using the + button in the sidebar.
        </p>
      </div>
    </div>
  );
}
