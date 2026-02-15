"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Get run history for a specific automation (last 200 runs)
 */
export async function getAutomationRunHistory(
  companyId: string,
  jobId: string,
  automationId: string
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("automation_runs")
    .select(`
      id,
      status,
      error,
      skip_reason,
      created_at,
      actions_attempted,
      actions_succeeded,
      actions_failed,
      duration_ms,
      payload,
      action_results
    `)
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .eq("automation_id", automationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[getAutomationRunHistory] Error:", error);
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Get detailed information about a specific automation run
 */
export async function getAutomationRunDetails(
  companyId: string,
  jobId: string,
  runId: string
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("automation_runs")
    .select(`
      id,
      automation_id,
      trigger_key,
      subject_type,
      subject_id,
      status,
      error,
      skip_reason,
      created_at,
      payload,
      actions_attempted,
      actions_succeeded,
      actions_failed,
      duration_ms,
      action_results
    `)
    .eq("id", runId)
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .single();

  if (error) {
    console.error("[getAutomationRunDetails] Error:", error);
    throw new Error(error.message);
  }

  return data;
}
