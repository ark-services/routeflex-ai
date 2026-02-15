"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";

function jobPath(companyId: string, jobId: string) {
  return `/dashboard/${companyId}/jobs/${jobId}/applicants`;
}

/**
 * List all automations for a specific job
 */
export async function listJobAutomations(companyId: string, jobId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
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
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return data || [];
}

/**
 * Create a new job-level automation recipe
 */
export async function createJobAutomation(
  companyId: string,
  jobId: string,
  input: {
    name: string;
    trigger_key: string;
    filter?: Record<string, any>;
    actions: Array<{
      type: "move_group" | "set_status" | "webhook" | "send_email";
      config: Record<string, any>;
      sort_order?: number;
    }>;
  }
) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Create automation
  const { data: automation, error: automationError } = await supabase
    .from("automations")
    .insert({
      company_id: companyId,
      job_id: jobId,
      name: input.name,
      trigger_key: input.trigger_key,
      filter: input.filter || {},
      created_by: user.id,
    })
    .select()
    .single();

  if (automationError || !automation) {
    throw new Error(automationError?.message || "Failed to create automation");
  }

  // Create actions
  if (input.actions && input.actions.length > 0) {
    const actionsToInsert = input.actions.map((action, index) => ({
      automation_id: automation.id,
      company_id: companyId,
      job_id: jobId,
      type: action.type,
      config: action.config,
      sort_order: action.sort_order ?? index,
    }));

    const { error: actionsError } = await supabase
      .from("automation_actions")
      .insert(actionsToInsert);

    if (actionsError) {
      // Rollback automation if actions fail
      await supabase.from("automations").delete().eq("id", automation.id);
      throw new Error(actionsError.message);
    }
  }

  revalidatePath(jobPath(companyId, jobId));
  return automation;
}

/**
 * Toggle automation enabled/disabled
 */
export async function toggleJobAutomation(
  companyId: string,
  jobId: string,
  automationId: string,
  is_enabled: boolean
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("automations")
    .update({ is_enabled })
    .eq("id", automationId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  revalidatePath(jobPath(companyId, jobId));
}

/**
 * Delete an automation
 */
export async function deleteJobAutomation(
  companyId: string,
  jobId: string,
  automationId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("automations")
    .delete()
    .eq("id", automationId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  revalidatePath(jobPath(companyId, jobId));
}

/**
 * Get automation run history for a job
 */
export async function listJobAutomationRuns(
  companyId: string,
  jobId: string,
  options?: {
    limit?: number;
    automationId?: string;
  }
) {
  const supabase = await createClient();

  let query = supabase
    .from("automation_runs")
    .select(`
      id,
      automation_id,
      trigger_key,
      subject_type,
      subject_id,
      status,
      error,
      created_at
    `)
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(options?.limit || 50);

  if (options?.automationId) {
    query = query.eq("automation_id", options.automationId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return data || [];
}

/**
 * Test-fire an automation trigger (for testing)
 */
export async function testFireJobAutomation(
  companyId: string,
  jobId: string,
  input: {
    trigger_key: string;
    subject_type: string;
    subject_id: string;
    payload: Record<string, any>;
  }
) {
  const supabase = await createClient();

  await fireJobTrigger(supabase, {
    companyId,
    jobId,
    trigger_key: input.trigger_key,
    subject_type: input.subject_type,
    subject_id: input.subject_id,
    payload: {
      ...input.payload,
      company_id: companyId,
      job_id: jobId,
    },
  });

  revalidatePath(jobPath(companyId, jobId));
  return { success: true };
}

/**
 * Get available groups for this job (for action config)
 */
export async function getJobGroups(companyId: string, jobId: string) {
  const supabase = await createClient();

  // Get board for this job
  const { data: board } = await supabase
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .single();

  if (!board) return [];

  const { data: groups } = await supabase
    .from("board_groups")
    .select("id, name, color")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });

  return groups || [];
}

/**
 * Get trigger types catalog
 */
export async function getAutomationTriggers() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("automation_triggers")
    .select("*")
    .order("key");

  if (error) throw new Error(error.message);

  return data || [];
}
