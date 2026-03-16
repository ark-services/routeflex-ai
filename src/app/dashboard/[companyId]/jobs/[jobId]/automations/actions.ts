"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";
import { AutomationActionType } from "@/lib/automations/actionTypes";
import { actorName } from "@/lib/helpers/actorName";

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
      agent_id,
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
    agent_id?: string | null;
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
      ...(input.agent_id ? { agent_id: input.agent_id } : {}),
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
      skip_reason,
      created_at,
      actions_attempted,
      actions_succeeded,
      actions_failed,
      duration_ms,
      action_results
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
    agent_id?: string | null;
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
      agent_id: input.agent_id ?? null,
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
      agent_id,
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
      agent_id: source.agent_id ?? null,
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

/**
 * One-click setup: create an AI resume screening automation with all required columns.
 * Finds or creates Resume/CV (file), AI Score (number), AI Feedback (text) columns,
 * then creates the automation: form.submitted + resume not empty → ai.score_resume.
 */
export async function setupAiScreeningAutomation(
  companyId: string,
  jobId: string
): Promise<{ success: boolean; alreadyExists?: boolean }> {
  const supabase = await createClient();
  const service = createServiceClient();

  // 1. Get the board for this job
  const { data: board } = await service
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .single();

  if (!board) throw new Error("No board found for this job");

  // 2. Fetch existing columns
  const { data: existingColumns } = await service
    .from("board_columns")
    .select("id, name, type, sort_order")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });

  const columns = existingColumns || [];
  let maxSortOrder = columns.reduce(
    (max, c) => Math.max(max, c.sort_order ?? 0),
    0
  );

  // 3. Find or create required columns

  // Resume/CV — first file column, or create one
  let fileCol = columns.find((c) => c.type === "file");
  if (!fileCol) {
    maxSortOrder += 1;
    const { data, error } = await service
      .from("board_columns")
      .insert({
        board_id: board.id,
        company_id: companyId,
        name: "Resume/CV",
        type: "file",
        sort_order: maxSortOrder,
      })
      .select("id, name, type, sort_order")
      .single();
    if (error || !data) throw new Error(`Failed to create Resume/CV column: ${error?.message}`);
    fileCol = data;
  }

  // AI Score — match by name + type
  let scoreCol = columns.find(
    (c) => c.name === "AI Score" && c.type === "number"
  );
  if (!scoreCol) {
    maxSortOrder += 1;
    const { data, error } = await service
      .from("board_columns")
      .insert({
        board_id: board.id,
        company_id: companyId,
        name: "AI Score",
        type: "number",
        sort_order: maxSortOrder,
      })
      .select("id, name, type, sort_order")
      .single();
    if (error || !data) throw new Error(`Failed to create AI Score column: ${error?.message}`);
    scoreCol = data;
  }

  // AI Feedback — match by name + type
  let feedbackCol = columns.find(
    (c) => c.name === "AI Feedback" && c.type === "text"
  );
  if (!feedbackCol) {
    maxSortOrder += 1;
    const { data, error } = await service
      .from("board_columns")
      .insert({
        board_id: board.id,
        company_id: companyId,
        name: "AI Feedback",
        type: "text",
        sort_order: maxSortOrder,
      })
      .select("id, name, type, sort_order")
      .single();
    if (error || !data) throw new Error(`Failed to create AI Feedback column: ${error?.message}`);
    feedbackCol = data;
  }

  // 4. Check if an ai.score_resume automation already exists for this job
  const { data: existingActions } = await service
    .from("automation_actions")
    .select("id, automation_id, automations!inner(id, job_id)")
    .eq("type", "ai.score_resume")
    .eq("automations.job_id", jobId);

  if (existingActions && existingActions.length > 0) {
    return { success: true, alreadyExists: true };
  }

  // 5. Create the automation via the existing helper (uses user context for created_by)
  await createJobAutomation(companyId, jobId, {
    name: "Pre-screen applicants with AI",
    trigger_key: "form.submitted",
    filter: {
      conditions: [
        { type: "is_not_empty", column_id: fileCol.id },
      ],
    },
    actions: [
      {
        type: "ai.score_resume" as AutomationActionType,
        config: {
          file_column_id: fileCol.id,
          score_column_id: scoreCol.id,
          feedback_column_id: feedbackCol.id,
          criteria:
            "Score this applicant 1-10 based on their resume quality, relevant experience, and qualifications. Consider driving experience, reliability indicators, and professional presentation.",
        },
        sort_order: 0,
      },
    ],
  });

  return { success: true };
}

/**
 * One-click setup: create a FADV submission automation with all required columns.
 * Finds or creates FADV Package, Facility ID, Position Type (text) and FADV Status
 * (status column with Pending/Submit/Submitted labels). Trigger fires when FADV Status
 * changes to "Submit".
 */
export async function setupFadvAutomation(
  companyId: string,
  jobId: string
): Promise<{ success: boolean; alreadyExists?: boolean }> {
  const service = createServiceClient();

  // 1. Get the board for this job
  const { data: board } = await service
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .single();

  if (!board) throw new Error("No board found for this job");

  // 2. Fetch existing columns
  const { data: existingColumns } = await service
    .from("board_columns")
    .select("id, name, type, sort_order")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });

  const columns = existingColumns || [];
  let maxSortOrder = columns.reduce(
    (max, c) => Math.max(max, c.sort_order ?? 0),
    0
  );

  // 3. Check if a fadv.add_subject automation already exists for this job
  const { data: existingActions } = await service
    .from("automation_actions")
    .select("id, automation_id, automations!inner(id, job_id)")
    .eq("type", "fadv.add_subject")
    .eq("automations.job_id", jobId);

  if (existingActions && existingActions.length > 0) {
    return { success: true, alreadyExists: true };
  }

  const boardId = board.id;

  // Helper: find or create a text column by name
  async function findOrCreateTextCol(name: string): Promise<{ id: string }> {
    const existing = columns.find((c) => c.name === name && c.type === "text");
    if (existing) return existing;
    maxSortOrder += 1;
    const { data, error } = await service
      .from("board_columns")
      .insert({ board_id: boardId, company_id: companyId, name, type: "text", sort_order: maxSortOrder })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create column "${name}": ${error?.message}`);
    return data;
  }

  // 4. Find or create required text columns
  const packageCol = await findOrCreateTextCol("FADV Package");
  const facilityCol = await findOrCreateTextCol("FADV Facility ID");
  const positionCol = await findOrCreateTextCol("FADV Position Type");
  const outputCol = await findOrCreateTextCol("FADV Output");
  const subjectIdCol = await findOrCreateTextCol("FADV Subject ID");

  // 5. Find or create FADV Status (status column)
  const existingStatusCol = columns.find((c) => c.name === "FADV Status" && c.type === "status");
  let statusColId: string;
  let submittedLabelId: string;

  if (!existingStatusCol) {
    maxSortOrder += 1;
    const { data, error } = await service
      .from("board_columns")
      .insert({ board_id: boardId, company_id: companyId, name: "FADV Status", type: "status", sort_order: maxSortOrder })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create FADV Status column: ${error?.message}`);
    statusColId = data.id;

    // Create status labels: Submitted → Pending Approval → Approved
    const { data: labels, error: labelErr } = await service
      .from("board_status_labels")
      .insert([
        { column_id: statusColId, label: "Submitted",        color: "#3B82F6", sort_order: 0 },
        { column_id: statusColId, label: "Pending Approval", color: "#F59E0B", sort_order: 1 },
        { column_id: statusColId, label: "Approved",         color: "#10B981", sort_order: 2 },
      ])
      .select("id, label");
    if (labelErr || !labels) throw new Error(`Failed to create FADV Status labels: ${labelErr?.message}`);
    submittedLabelId = labels.find((l) => l.label === "Submitted")!.id;
  } else {
    statusColId = existingStatusCol.id;
    // Column already exists — find the "Submitted" label
    const { data: labels } = await service
      .from("board_status_labels")
      .select("id, label")
      .eq("column_id", statusColId);
    const submittedLabel = (labels || []).find((l) => l.label === "Submitted");
    if (!submittedLabel) throw new Error("FADV Status column exists but has no 'Submitted' label");
    submittedLabelId = submittedLabel.id;
  }

  // 6. Find first/last name columns by pattern; find or create email column
  const firstNameCol = columns.find((c) =>
    /first.?name/i.test(c.name) && c.type === "text"
  );
  const lastNameCol = columns.find((c) =>
    /last.?name/i.test(c.name) && c.type === "text"
  );
  // Email: match existing by name/type, or create one
  const emailColExisting = columns.find((c) =>
    /email/i.test(c.name) && (c.type === "text" || c.type === "email")
  );
  const emailCol = emailColExisting ?? (await findOrCreateTextCol("Email Address"));

  // 7. Create the automation
  await createJobAutomation(companyId, jobId, {
    name: "Submit to First Advantage",
    trigger_key: "board.status_changes_to",
    filter: {
      column_id: statusColId,
      changes_to: submittedLabelId,
    },
    actions: [
      {
        type: "fadv.add_subject" as AutomationActionType,
        config: {
          package_column_id: packageCol.id,
          facility_id_column_id: facilityCol.id,
          position_type_column_id: positionCol.id,
          output_column_id: outputCol.id,
          email_column_id: emailCol.id,
          subject_id_column_id: subjectIdCol.id,
          ...(firstNameCol ? { first_name_column_id: firstNameCol.id } : {}),
          ...(lastNameCol ? { last_name_column_id: lastNameCol.id } : {}),
        },
        sort_order: 0,
      },
    ],
  });

  return { success: true };
}

// ── Automation Agents CRUD ──────────────────────────────────────────────────

export interface AutomationAgent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * List all automation agents for a job
 */
export async function listJobAutomationAgents(
  companyId: string,
  jobId: string
): Promise<AutomationAgent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("automation_agents")
    .select("id, name, emoji, description, sort_order, is_enabled, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Create a new automation agent
 */
export async function createJobAutomationAgent(
  companyId: string,
  jobId: string,
  input: { name: string; emoji?: string; description?: string }
) {
  const supabase = await createClient();

  // Get max sort_order
  const { data: existing } = await supabase
    .from("automation_agents")
    .select("sort_order")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("automation_agents")
    .insert({
      company_id: companyId,
      job_id: jobId,
      name: input.name,
      emoji: input.emoji || "🤖",
      description: input.description || "",
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(jobPath(companyId, jobId));
  return data;
}

/**
 * Update an automation agent (name, emoji)
 */
export async function updateJobAutomationAgent(
  companyId: string,
  jobId: string,
  agentId: string,
  input: { name?: string; emoji?: string; description?: string }
) {
  const supabase = await createClient();

  const updates: Record<string, any> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.emoji !== undefined) updates.emoji = input.emoji;
  if (input.description !== undefined) updates.description = input.description;

  const { error } = await supabase
    .from("automation_agents")
    .update(updates)
    .eq("id", agentId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  revalidatePath(jobPath(companyId, jobId));
}

/**
 * Toggle an automation agent enabled/disabled
 */
export async function toggleJobAutomationAgent(
  companyId: string,
  jobId: string,
  agentId: string,
  is_enabled: boolean
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("automation_agents")
    .update({ is_enabled })
    .eq("id", agentId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  revalidatePath(jobPath(companyId, jobId));
}

/**
 * Delete an automation agent (automations get unassigned via ON DELETE SET NULL)
 */
export async function deleteJobAutomationAgent(
  companyId: string,
  jobId: string,
  agentId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("automation_agents")
    .delete()
    .eq("id", agentId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  revalidatePath(jobPath(companyId, jobId));
}

/**
 * Reorder agents by updating their sort_order to match the given array order
 */
export async function reorderJobAutomationAgents(
  companyId: string,
  jobId: string,
  orderedIds: string[]
) {
  const supabase = await createClient();

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("automation_agents")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("company_id", companyId)
        .eq("job_id", jobId)
    )
  );

  revalidatePath(jobPath(companyId, jobId));
}

/**
 * Assign an automation to an agent (or unassign with null)
 */
export async function assignAutomationToAgent(
  companyId: string,
  jobId: string,
  automationId: string,
  agentId: string | null
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("automations")
    .update({ agent_id: agentId })
    .eq("id", automationId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  revalidatePath(jobPath(companyId, jobId));
}
