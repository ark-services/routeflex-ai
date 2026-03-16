import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Users } from "lucide-react";
import KnowledgeBaseEditor from "./KnowledgeBaseEditor";
import { getKnowledgeBaseEntries, getKBSuggestions } from "./actions";

export default async function KnowledgeBasePage({
  params,
}: {
  params: Promise<{ companyId: string; jobId: string }>;
}) {
  const { companyId, jobId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

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

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .single();

  if (!job) redirect(`/dashboard/${companyId}`);

  try {
    const [entries, agentsResult, suggestions, automationsResult, triggersResult] =
      await Promise.all([
        getKnowledgeBaseEntries(jobId),
        supabase
          .from("automation_agents")
          .select("id, name, emoji, description, sort_order, is_enabled, created_at, updated_at")
          .eq("company_id", companyId)
          .eq("job_id", jobId)
          .order("sort_order"),
        getKBSuggestions(jobId),
        supabase
          .from("automations")
          .select(`
            id, name, is_enabled, trigger_key, filter, agent_id, created_at, updated_at,
            automation_actions ( id, type, config, sort_order )
          `)
          .eq("company_id", companyId)
          .eq("job_id", jobId)
          .order("created_at", { ascending: false }),
        supabase.from("automation_triggers").select("*").order("key"),
      ]);

    const agents = agentsResult.data ?? [];

    if (agents.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center px-6 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rf-blue-tint mb-5">
            <BookOpen className="h-8 w-8 text-rf-blue" />
          </div>
          <h2 className="text-lg font-bold text-rf-ink-900 mb-2">
            Set up agents first
          </h2>
          <p className="text-sm text-rf-text-muted text-center max-w-sm leading-relaxed mb-6">
            The knowledge base is organised around agents. Create at least one
            agent in the Agents panel, then come back here to assign Q&amp;As to
            them.
          </p>
          <Link
            href={`/dashboard/${companyId}/jobs/${jobId}/applicants?automate=open`}
            className="inline-flex items-center gap-2 h-9 px-4 bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark transition-colors text-sm font-medium shadow-rf-sm"
          >
            <Users className="h-4 w-4" />
            Open Agents
          </Link>
        </div>
      );
    }

    return (
      <div className="h-full">
        <KnowledgeBaseEditor
          companyId={companyId}
          jobId={jobId}
          jobTitle={job.title}
          accountId={company.account_id}
          initialEntries={entries}
          agents={agents}
          initialSuggestions={suggestions}
          automations={automationsResult.data ?? []}
          triggers={triggersResult.data ?? []}
        />
      </div>
    );
  } catch (error) {
    console.error("[KnowledgeBasePage] Error loading knowledge base:", error);
    return (
      <div className="p-8">
        <div className="bg-rf-danger-bg border border-red-200 rounded-md p-4">
          <h3 className="text-rf-danger font-medium">
            Error Loading Knowledge Base
          </h3>
          <p className="text-rf-danger text-sm mt-1">
            Could not load the knowledge base. Please try refreshing the page.
          </p>
        </div>
      </div>
    );
  }
}
