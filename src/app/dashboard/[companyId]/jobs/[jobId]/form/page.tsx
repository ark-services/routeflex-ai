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

    // If the form has a logo stored in the private "logos" bucket, generate a
    // fresh 1-hour signed URL so the Design panel can display it immediately.
    // We do this server-side so the anon key is never exposed to the browser.
    const logoPath = (form.settings as Record<string, any>)?.design?.logoPath as
      | string
      | undefined;
    let logoSignedUrl = "";
    if (logoPath) {
      const { data } = await supabase.storage
        .from("logos")
        .createSignedUrl(logoPath, 3600);
      logoSignedUrl = data?.signedUrl ?? "";
    }

    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-hidden">
          <FormBuilder
            companyId={companyId}
            jobId={jobId}
            form={form}
            fields={fields}
            jobTitle={job.title}
            logoSignedUrl={logoSignedUrl}
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error("[ApplicationFormPage] Error loading form:", error);
    return (
      <div className="p-8">
        <div className="bg-rf-danger-bg border border-red-200 rounded-md p-4">
          <h3 className="text-rf-danger font-medium">Error Loading Form</h3>
          <p className="text-rf-danger text-sm mt-1">
            Could not load the application form. Please try recreating the job.
          </p>
        </div>
      </div>
    );
  }
}
