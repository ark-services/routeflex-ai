import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditAutomationClient } from "./EditAutomationClient";
import {
  getAutomationTriggers,
  getJobGroups,
  getJobBoardColumns,
} from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";

export default async function EditAutomationPage({
  params,
}: {
  params: Promise<{ companyId: string; jobId: string; automationId: string }>;
}) {
  const { companyId, jobId, automationId } = await params;
  const supabase = await createClient();

  // Fetch automation with actions
  const { data: automation, error } = await supabase
    .from("automations")
    .select(`
      id,
      name,
      is_enabled,
      trigger_key,
      filter,
      created_at,
      updated_at,
      automation_actions (
        id,
        type,
        config,
        sort_order
      )
    `)
    .eq("id", automationId)
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .single();

  if (error || !automation) {
    notFound();
  }

  // Fetch metadata for the editor
  const [triggers, groups] = await Promise.all([
    getAutomationTriggers(),
    getJobGroups(companyId, jobId),
  ]);

  return (
    <div className="min-h-screen bg-stone-50">
      <EditAutomationClient
        companyId={companyId}
        jobId={jobId}
        automation={automation}
        triggers={triggers}
        groups={groups}
      />
    </div>
  );
}
