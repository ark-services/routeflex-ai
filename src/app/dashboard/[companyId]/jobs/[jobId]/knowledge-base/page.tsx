import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import KnowledgeBaseEditor from "./KnowledgeBaseEditor";
import { getKnowledgeBaseEntries } from "./actions";

export default async function KnowledgeBasePage({
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

  if (!company) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/dashboard");

  // Verify job exists and belongs to company
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .single();

  if (!job) redirect(`/dashboard/${companyId}`);

  try {
    const entries = await getKnowledgeBaseEntries(jobId);

    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-auto">
          <KnowledgeBaseEditor
            companyId={companyId}
            jobId={jobId}
            jobTitle={job.title}
            initialEntries={entries}
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error("[KnowledgeBasePage] Error loading knowledge base:", error);
    return (
      <div className="p-8">
        <div className="bg-rf-danger-bg border border-red-200 rounded-md p-4">
          <h3 className="text-rf-danger font-medium">Error Loading Knowledge Base</h3>
          <p className="text-rf-danger text-sm mt-1">
            Could not load the knowledge base. Please try refreshing the page.
          </p>
        </div>
      </div>
    );
  }
}
