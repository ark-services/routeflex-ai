import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FormBuilder from "./FormBuilder";
import { getApplicationForm, getFormFields } from "./actions";

export default async function ApplicationFormPage({
  params,
}: {
  params: Promise<{ companyId: string; jobId: string }>;
}) {
  const { companyId, jobId } = await params;
  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Verify access to company
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, slug, account_id")
    .eq("id", companyId)
    .single();

  if (!company) redirect("/");

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/");

  // Verify job exists and belongs to company
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .single();

  if (!job) redirect(`/dashboard/${companyId}`);

  // Get application form
  try {
    const form = await getApplicationForm(companyId, jobId);
    const fields = await getFormFields(form.id);

    return (
      <div className="h-full flex flex-col">
        {/* Form Builder – nav tabs moved to left sidebar */}
        <div className="flex-1 overflow-hidden">
          <FormBuilder
            companyId={companyId}
            jobId={jobId}
            form={form}
            fields={fields}
            jobTitle={job.title}
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error("[ApplicationFormPage] Error loading form:", error);
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <h3 className="text-red-800 font-medium">Error Loading Form</h3>
          <p className="text-red-600 text-sm mt-1">
            Could not load the application form. Please try recreating the job.
          </p>
        </div>
      </div>
    );
  }
}
