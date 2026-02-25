"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";
import { AutomationActionType } from "@/lib/automations/actionTypes";

function actorName(user: { user_metadata?: { full_name?: string }; email?: string } | null): string {
  return user?.user_metadata?.full_name ?? user?.email ?? "Someone";
}

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
      type: AutomationActionType;
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

  // Log activity
  try {
    const actor = actorName(user);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user.id,
      actorType: "user",
      eventType: "automation.created",
      entityType: "automation",
      entityId: automation.id,
      summary: `${actor} created automation "${automation.name}"`,
      data: { actor_name: actor, automation_name: automation.name },
    });
  } catch {}

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

  // Fetch automation name for summary
  const { data: auto } = await supabase
    .from("automations")
    .select("name")
    .eq("id", automationId)
    .maybeSingle();

  const { error } = await supabase
    .from("automations")
    .update({ is_enabled })
    .eq("id", automationId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  // Log activity
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const actor = actorName(user);
    const autoName = auto?.name ?? "automation";
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user?.id ?? null,
      actorType: "user",
      eventType: is_enabled ? "automation.enabled" : "automation.disabled",
      entityType: "automation",
      entityId: automationId,
      summary: `${actor} ${is_enabled ? "enabled" : "disabled"} automation "${autoName}"`,
      data: { actor_name: actor, automation_name: autoName },
    });
  } catch {}

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

  // Fetch automation name before deletion
  const { data: auto } = await supabase
    .from("automations")
    .select("name")
    .eq("id", automationId)
    .maybeSingle();

  const { error } = await supabase
    .from("automations")
    .delete()
    .eq("id", automationId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  // Log activity
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const actor = actorName(user);
    const autoName = auto?.name ?? "automation";
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user?.id ?? null,
      actorType: "user",
      eventType: "automation.deleted",
      entityType: "automation",
      entityId: automationId,
      summary: `${actor} deleted automation "${autoName}"`,
      data: { actor_name: actor, automation_name: autoName },
    });
  } catch {}

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

/**
 * Get board columns with metadata for this job (for interactive UI pickers)
 */
export async function getJobBoardColumns(companyId: string, jobId: string) {
  const supabase = await createClient();

  // Get board for this job
  const { data: board } = await supabase
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .single();

  if (!board) return [];

  // Get columns
  const { data: columns } = await supabase
    .from("board_columns")
    .select("id, name, type, sort_order, settings")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });

  if (!columns) return [];

  // For status columns, fetch their labels
  const statusColumnIds = columns
    .filter((c) => c.type === "status")
    .map((c) => c.id);

  let statusLabels: any[] = [];
  if (statusColumnIds.length > 0) {
    const { data: labels } = await supabase
      .from("board_status_labels")
      .select("id, column_id, label, color, sort_order")
      .in("column_id", statusColumnIds)
      .order("sort_order", { ascending: true });

    statusLabels = labels || [];
  }

  // Merge labels into columns
  return columns.map((col) => ({
    ...col,
    labels:
      col.type === "status"
        ? statusLabels.filter((l) => l.column_id === col.id)
        : [],
  }));
}

/**
 * Get published LMS courses for a company (for the lms.send_training_link action picker)
 */
export async function getLmsCoursesForCompany(companyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lms_courses")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("is_published", true)
    .order("name", { ascending: true });
  return data || [];
}

/**
 * Update an existing automation
 */
export async function updateJobAutomation(
  companyId: string,
  jobId: string,
  automationId: string,
  input: {
    name: string;
    trigger_key: string;
    filter?: Record<string, any>;
    actions: Array<{
      type: string;
      config: Record<string, any>;
      sort_order?: number;
    }>;
  }
) {
  const supabase = await createClient();

  // Update automation metadata
  const { error: updateError } = await supabase
    .from("automations")
    .update({
      name: input.name,
      trigger_key: input.trigger_key,
      filter: input.filter || {},
    })
    .eq("id", automationId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // Delete old actions
  const { error: deleteError } = await supabase
    .from("automation_actions")
    .delete()
    .eq("automation_id", automationId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  // Insert new actions
  if (input.actions && input.actions.length > 0) {
    const actionsToInsert = input.actions.map((action, index) => ({
      automation_id: automationId,
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
      throw new Error(actionsError.message);
    }
  }

  // Log activity
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const actor = actorName(user);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user?.id ?? null,
      actorType: "user",
      eventType: "automation.updated",
      entityType: "automation",
      entityId: automationId,
      summary: `${actor} updated automation "${input.name}"`,
      data: { actor_name: actor, automation_name: input.name },
    });
  } catch {}

  revalidatePath(jobPath(companyId, jobId));
}

/**
 * Duplicate an existing automation
 */
export async function duplicateJobAutomation(
  companyId: string,
  jobId: string,
  automationId: string
) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fetch source automation
  const { data: source, error: fetchError } = await supabase
    .from("automations")
    .select(`
      id,
      name,
      trigger_key,
      filter,
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

  if (fetchError || !source) {
    throw new Error("Automation not found");
  }

  // Create duplicate automation
  const { data: newAutomation, error: createError } = await supabase
    .from("automations")
    .insert({
      company_id: companyId,
      job_id: jobId,
      name: `${source.name} (Copy)`,
      trigger_key: source.trigger_key,
      filter: source.filter,
      created_by: user.id,
    })
    .select()
    .single();

  if (createError || !newAutomation) {
    throw new Error(createError?.message || "Failed to duplicate automation");
  }

  // Duplicate actions
  if (source.automation_actions && source.automation_actions.length > 0) {
    const actionsToInsert = source.automation_actions.map((action: any) => ({
      automation_id: newAutomation.id,
      company_id: companyId,
      job_id: jobId,
      type: action.type,
      config: action.config,
      sort_order: action.sort_order,
    }));

    const { error: actionsError } = await supabase
      .from("automation_actions")
      .insert(actionsToInsert);

    if (actionsError) {
      // Rollback automation if actions fail
      await supabase.from("automations").delete().eq("id", newAutomation.id);
      throw new Error(actionsError.message);
    }
  }

  revalidatePath(jobPath(companyId, jobId));
  return newAutomation;
}
