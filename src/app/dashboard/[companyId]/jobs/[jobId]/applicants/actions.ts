"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function dashPath(companyId: string, jobId: string) {
  return `/dashboard/${companyId}/jobs/${jobId}/applicants`;
}

// ===== Board Management =====

/**
 * Gets or creates the canonical "Applicants" board for a specific job.
 * Ensures exactly one Applicants board exists per job.
 */
export async function getOrCreateApplicantsBoard(
  companyId: string,
  jobId: string
): Promise<string> {
  const supabase = await createClient();

  // Look for existing Applicants board for this specific job
  const { data: existingBoards } = await supabase
    .from("boards")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .eq("name", "Applicants")
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingBoards && existingBoards.length > 0) {
    // Return the first (oldest) Applicants board for this job
    return existingBoards[0].id;
  }

  // No board exists for this job, create one
  const { data: newBoard, error: boardError } = await supabase
    .from("boards")
    .insert({
      company_id: companyId,
      job_id: jobId,
      name: "Applicants",
    })
    .select("id")
    .single();

  if (boardError) {
    console.error("[getOrCreateApplicantsBoard] Failed to create Applicants board:", boardError);
    throw new Error("Failed to create Applicants board");
  }

  return newBoard.id;
}

// Note: Board columns and groups are now created during job creation
// via the form engine. See /jobs/actions.ts addJob() function.

export async function updateApplicantStatus(
  companyId: string,
  jobId: string,
  applicantId: string,
  status: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .update({ status })
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) {
    console.error("[updateApplicantStatus] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function bulkMoveApplicants(
  companyId: string,
  jobId: string,
  applicantIds: string[],
  groupId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .update({ group_id: groupId })
    .in("id", applicantIds)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) {
    console.error("[bulkMoveApplicants] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function bulkDeleteApplicants(
  companyId: string,
  jobId: string,
  applicantIds: string[]
) {
  const supabase = await createClient();

  // Get current user info for debugging
  const { data: { user } } = await supabase.auth.getUser();

  console.log('[bulkDeleteApplicants] Called with:', {
    userId: user?.id,
    userEmail: user?.email,
    companyId,
    jobId,
    applicantIds,
    requestedCount: applicantIds.length,
  });

  // First, check which applicants exist and are visible
  const { data: existingApplicants, error: checkError } = await supabase
    .from("applicants")
    .select("id, full_name")
    .in("id", applicantIds);

  console.log('[bulkDeleteApplicants] Pre-delete check:', {
    requestedCount: applicantIds.length,
    foundCount: existingApplicants?.length || 0,
    applicants: existingApplicants?.map(a => ({ id: a.id, name: a.full_name })),
    checkError: checkError?.message,
  });

  if (checkError) {
    console.error('[bulkDeleteApplicants] Pre-delete check failed:', checkError);
  }

  // Verify user permissions
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role, account_id")
    .eq("user_id", user?.id || '')
    .maybeSingle();

  const { data: company } = await supabase
    .from("companies")
    .select("account_id")
    .eq("id", companyId)
    .maybeSingle();

  console.log('[bulkDeleteApplicants] Permission check:', {
    userMembership: membership,
    companyAccount: company?.account_id,
    hasPermission: membership?.account_id === company?.account_id,
    userRole: membership?.role,
  });

  // Attempt delete
  const { error, count } = await supabase
    .from("applicants")
    .delete({ count: 'exact' })
    .in("id", applicantIds)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) {
    console.error("[bulkDeleteApplicants] Supabase Error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(`Bulk delete failed: ${error.message}`);
  }

  console.log('[bulkDeleteApplicants] Delete result:', {
    deletedCount: count,
    requestedCount: applicantIds.length,
    success: count === applicantIds.length,
  });

  if (count === 0) {
    console.error('[bulkDeleteApplicants] CRITICAL: No rows deleted!', {
      applicantsExist: existingApplicants && existingApplicants.length > 0,
      requestedIds: applicantIds,
      foundIds: existingApplicants?.map(a => a.id),
      possibleCauses: [
        'RLS DELETE policy blocking (user not admin/owner - check migration 00022)',
        'company_id or job_id mismatch',
        'Applicants already deleted',
      ],
    });
    throw new Error('Failed to delete applicants. You may not have delete permissions.');
  }

  if (count !== applicantIds.length) {
    console.warn('[bulkDeleteApplicants] Partial delete:', {
      requested: applicantIds.length,
      deleted: count,
      missing: applicantIds.length - (count || 0),
    });
  }

  console.log(`[bulkDeleteApplicants] Successfully deleted ${count} applicant(s)`);

  revalidatePath(dashPath(companyId, jobId));
}

export async function createGroup(
  companyId: string,
  jobId: string,
  boardId: string,
  name: string,
  color?: string
) {
  const supabase = await createClient();

  // Default colors cycle (Monday-style)
  const defaultColors = ['#0073ea', '#00c875', '#fdab3d', '#e2445c', '#9cd326', '#784bd1', '#579bfc', '#ff642e'];

  // Put it at the end
  const { data: existing, error: readErr } = await supabase
    .from("board_groups")
    .select("sort_order")
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (readErr) {
    console.error("[createGroup] Error reading existing groups:", readErr);
    throw new Error(readErr.message);
  }

  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;
  const groupColor = color || defaultColors[nextSort % defaultColors.length];

  const { error } = await supabase
    .from("board_groups")
    .insert({
      company_id: companyId,
      board_id: boardId,
      name,
      sort_order: nextSort,
      color: groupColor,
    });

  if (error) {
    console.error("[createGroup] Error creating group:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function toggleGroupCollapse(
  companyId: string,
  jobId: string,
  boardId: string,
  groupId: string,
  isCollapsed: boolean
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_groups")
    .update({ is_collapsed: isCollapsed })
    .eq("id", groupId)
    .eq("company_id", companyId)
    .eq("board_id", boardId);

  if (error) {
    console.error("[toggleGroupCollapse] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function updateGroupColor(
  companyId: string,
  jobId: string,
  boardId: string,
  groupId: string,
  color: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_groups")
    .update({ color })
    .eq("id", groupId)
    .eq("company_id", companyId)
    .eq("board_id", boardId);

  if (error) {
    console.error("[updateGroupColor] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function renameGroup(
  companyId: string,
  jobId: string,
  boardId: string,
  groupId: string,
  name: string
) {
  const supabase = await createClient();

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Group name cannot be empty");
  }

  // Check for duplicate name within same board
  const { data: existingGroup } = await supabase
    .from("board_groups")
    .select("id")
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .eq("name", trimmedName)
    .neq("id", groupId)
    .maybeSingle();

  if (existingGroup) {
    throw new Error("A group with this name already exists");
  }

  const { error } = await supabase
    .from("board_groups")
    .update({ name: trimmedName })
    .eq("id", groupId)
    .eq("company_id", companyId)
    .eq("board_id", boardId);

  if (error) {
    console.error("[renameGroup] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function deleteGroup(
  companyId: string,
  jobId: string,
  boardId: string,
  groupId: string
) {
  const supabase = await createClient();

  // Fetch all groups for board (sorted by sort_order)
  const { data: groups, error: fetchError } = await supabase
    .from("board_groups")
    .select("id, sort_order")
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true });

  if (fetchError) {
    console.error("[deleteGroup] Error fetching groups:", fetchError);
    throw new Error(fetchError.message);
  }

  // Prevent deletion if only 1 group remains
  if (!groups || groups.length <= 1) {
    throw new Error("Cannot delete the last group");
  }

  // Find first group that isn't being deleted (target group)
  const targetGroup = groups.find((g) => g.id !== groupId);
  if (!targetGroup) {
    throw new Error("No target group found for applicant migration");
  }

  // Move all applicants from deleted group to target group
  const { error: moveError } = await supabase
    .from("applicants")
    .update({ group_id: targetGroup.id })
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .eq("group_id", groupId);

  if (moveError) {
    console.error("[deleteGroup] Error moving applicants:", moveError);
    throw new Error(moveError.message);
  }

  // Delete the group
  const { error: deleteError } = await supabase
    .from("board_groups")
    .delete()
    .eq("id", groupId)
    .eq("company_id", companyId)
    .eq("board_id", boardId);

  if (deleteError) {
    console.error("[deleteGroup] Error deleting group:", deleteError);
    throw new Error(deleteError.message);
  }

  // Renormalize sort_order for remaining groups (0, 1, 2, ...)
  const remainingGroups = groups.filter((g) => g.id !== groupId);
  for (let i = 0; i < remainingGroups.length; i++) {
    await supabase
      .from("board_groups")
      .update({ sort_order: i })
      .eq("id", remainingGroups[i].id)
      .eq("company_id", companyId)
      .eq("board_id", boardId);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function reorderGroups(
  companyId: string,
  jobId: string,
  boardId: string,
  groupIds: string[]
) {
  const supabase = await createClient();

  // Update each group's sort_order based on array index
  for (let i = 0; i < groupIds.length; i++) {
    const { error } = await supabase
      .from("board_groups")
      .update({ sort_order: i })
      .eq("id", groupIds[i])
      .eq("company_id", companyId)
      .eq("board_id", boardId);

    if (error) {
      console.error("[reorderGroups] Error updating group sort_order:", error);
      throw new Error(error.message);
    }
  }

  revalidatePath(dashPath(companyId, jobId));
}

// ===== Board Column Actions =====

export async function createBoardColumn(
  companyId: string,
  jobId: string,
  name: string,
  columnType: "text" | "number" | "date" | "file" | "status",
  afterColumnId?: string
) {
  const supabase = await createClient();

  // Get or create the job-scoped Applicants board
  const boardId = await getOrCreateApplicantsBoard(companyId, jobId);

  let targetSortOrder: number;

  if (afterColumnId) {
    // Insert after a specific column
    const { data: afterColumn } = await supabase
      .from("board_columns")
      .select("sort_order")
      .eq("id", afterColumnId)
      .eq("company_id", companyId)
      .eq("board_id", boardId)
      .single();

    if (afterColumn) {
      targetSortOrder = afterColumn.sort_order + 0.5;
    } else {
      // Fallback to end
      const { data: existing } = await supabase
        .from("board_columns")
        .select("sort_order")
        .eq("company_id", companyId)
        .eq("board_id", boardId)
        .order("sort_order", { ascending: false })
        .limit(1);
      targetSortOrder = (existing?.[0]?.sort_order ?? 0) + 1;
    }
  } else {
    // Put at the end
    const { data: existing, error: readErr } = await supabase
      .from("board_columns")
      .select("sort_order")
      .eq("company_id", companyId)
      .eq("board_id", boardId)
      .order("sort_order", { ascending: false })
      .limit(1);

    if (readErr) {
      console.error("[createBoardColumn] Error reading existing columns:", readErr);
      throw new Error(readErr.message);
    }
    targetSortOrder = (existing?.[0]?.sort_order ?? 0) + 1;
  }

  const { data, error } = await supabase
    .from("board_columns")
    .insert({
      board_id: boardId,
      company_id: companyId,
      name,
      type: columnType,
      sort_order: targetSortOrder,
      is_system: false,
      settings: {},
    })
    .select()
    .single();

  if (error) {
    console.error("[createBoardColumn] Error creating column:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
  return data;
}

export async function duplicateBoardColumn(
  companyId: string,
  jobId: string,
  columnId: string
) {
  const supabase = await createClient();

  // Get or create the job-scoped Applicants board
  const boardId = await getOrCreateApplicantsBoard(companyId, jobId);

  // Get the source column
  const { data: sourceColumn, error: readErr } = await supabase
    .from("board_columns")
    .select("*")
    .eq("id", columnId)
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .single();

  if (readErr || !sourceColumn) {
    console.error("[duplicateBoardColumn] Column not found:", readErr);
    throw new Error("Column not found");
  }

  // Create duplicate with incremented sort order
  const { data: newColumn, error } = await supabase
    .from("board_columns")
    .insert({
      board_id: boardId,
      company_id: companyId,
      name: `${sourceColumn.name} (Copy)`,
      type: sourceColumn.type,
      sort_order: sourceColumn.sort_order + 0.5,
      is_system: false,
      settings: sourceColumn.settings || {},
    })
    .select()
    .single();

  if (error) {
    console.error("[duplicateBoardColumn] Error duplicating column:", error);
    throw new Error(error.message);
  }

  // If it's a status column, duplicate the labels
  if (sourceColumn.type === "status" && newColumn) {
    const { data: labels } = await supabase
      .from("board_status_labels")
      .select("*")
      .eq("column_id", columnId);

    if (labels && labels.length > 0) {
      const { error: labelError } = await supabase
        .from("board_status_labels")
        .insert(
          labels.map((label) => ({
            column_id: newColumn.id,
            label: label.label,
            color: label.color,
            sort_order: label.sort_order,
          }))
        );

      if (labelError) {
        console.error("[duplicateBoardColumn] Error duplicating status labels:", labelError);
      }
    }
  }

  revalidatePath(dashPath(companyId, jobId));
  return newColumn;
}

export async function updateBoardColumn(
  companyId: string,
  jobId: string,
  columnId: string,
  updates: { name?: string; sort_order?: number; is_hidden?: boolean }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_columns")
    .update(updates)
    .eq("id", columnId)
    .eq("company_id", companyId);

  if (error) {
    console.error("[updateBoardColumn] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function deleteBoardColumn(
  companyId: string,
  jobId: string,
  columnId: string
) {
  const supabase = await createClient();

  // Prevent deletion of system columns
  const { data: column } = await supabase
    .from("board_columns")
    .select("is_system")
    .eq("id", columnId)
    .eq("company_id", companyId)
    .single();

  if (column?.is_system) {
    throw new Error("Cannot delete system columns");
  }

  const { error } = await supabase
    .from("board_columns")
    .delete()
    .eq("id", columnId)
    .eq("company_id", companyId);

  if (error) {
    console.error("[deleteBoardColumn] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

// ===== Status Label Actions =====

export async function createStatusLabel(
  companyId: string,
  jobId: string,
  columnId: string,
  label: string,
  color: string
) {
  const supabase = await createClient();

  // Get next sort order
  const { data: existing, error: readErr } = await supabase
    .from("board_status_labels")
    .select("sort_order")
    .eq("column_id", columnId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (readErr) {
    console.error("[createStatusLabel] Error reading existing labels:", readErr);
    throw new Error(readErr.message);
  }

  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("board_status_labels")
    .insert({
      column_id: columnId,
      label,
      color,
      sort_order: nextSort,
    })
    .select()
    .single();

  if (error) {
    console.error("[createStatusLabel] Error creating status label:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
  return data;
}

export async function updateStatusLabel(
  companyId: string,
  jobId: string,
  labelId: string,
  updates: { label?: string; color?: string }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_status_labels")
    .update(updates)
    .eq("id", labelId);

  if (error) {
    console.error("[updateStatusLabel] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function deleteStatusLabel(
  companyId: string,
  jobId: string,
  labelId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_status_labels")
    .delete()
    .eq("id", labelId);

  if (error) {
    console.error("[deleteStatusLabel] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

// ===== Board Cell Actions =====

export async function updateBoardCell(
  companyId: string,
  jobId: string,
  applicantId: string,
  columnId: string,
  columnType: "text" | "number" | "date" | "status",
  value: any
) {
  // UUID validation regex
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Log all parameters for debugging
  console.log('[updateBoardCell] Called with parameters:', {
    companyId,
    jobId,
    applicantId,
    columnId,
    columnType,
    value,
  });

  // Validate UUID parameters
  const uuidParams = [
    { name: 'companyId', value: companyId },
    { name: 'jobId', value: jobId },
    { name: 'applicantId', value: applicantId },
    { name: 'columnId', value: columnId },
  ];

  for (const param of uuidParams) {
    if (!UUID_REGEX.test(param.value)) {
      const error = `Invalid UUID for ${param.name}: "${param.value}". Expected UUID format but got ${typeof param.value}.`;
      console.error('[updateBoardCell] Validation Error:', error);
      throw new Error(error);
    }
  }

  const supabase = await createClient();

  // For status columns, fetch old value before update
  let oldStatusLabelId: string | null = null;
  if (columnType === "status") {
    const { data: existingCell } = await supabase
      .from("board_cells")
      .select("value_status_label_id")
      .eq("applicant_id", applicantId)
      .eq("column_id", columnId)
      .single();

    oldStatusLabelId = existingCell?.value_status_label_id ?? null;
  }

  // Map value to appropriate column based on type
  const cellData: any = {
    applicant_id: applicantId,
    column_id: columnId,
    value_text: null,
    value_number: null,
    value_date: null,
    value_status_label_id: null,
  };

  if (columnType === "text") {
    cellData.value_text = value;
  } else if (columnType === "number") {
    cellData.value_number = value;
  } else if (columnType === "date") {
    cellData.value_date = value;
  } else if (columnType === "status") {
    cellData.value_status_label_id = value;
  }

  console.log('[updateBoardCell] Upserting cell data:', cellData);

  const { error, data } = await supabase
    .from("board_cells")
    .upsert(cellData, {
      onConflict: "applicant_id,column_id",
    })
    .select();

  if (error) {
    console.error("[updateBoardCell] Supabase Error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message);
  }

  console.log('[updateBoardCell] Success:', data);

  // TRIGGER AUTOMATION: Detect status change and dispatch
  if (columnType === "status" && oldStatusLabelId !== value) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: company } = await supabase
        .from("companies")
        .select("account_id")
        .eq("id", companyId)
        .single();

      // Non-blocking dispatch
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/.*$/, '') || 'http://localhost:3000';
      await fetch(`${baseUrl}/api/automations/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: company?.account_id,
          companyId,
          applicantId,
          columnId,
          oldStatusLabelId,
          newStatusLabelId: value,
          userId: user?.id,
        }),
      }).catch((err) => console.error('[updateBoardCell] Failed to dispatch automation:', err));
    } catch (automationError) {
      console.error('[updateBoardCell] Error in automation dispatch:', automationError);
      // Don't throw - automation errors should not block the cell update
    }
  }

  revalidatePath(dashPath(companyId, jobId));
}

// ===== Row (Applicant) Actions =====

export async function moveApplicant(
  companyId: string,
  jobId: string,
  applicantId: string,
  groupId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .update({ group_id: groupId })
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) {
    console.error("[moveApplicant] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function deleteApplicant(
  companyId: string,
  jobId: string,
  applicantId: string
) {
  const supabase = await createClient();

  // Get current user info for debugging
  const { data: { user } } = await supabase.auth.getUser();

  console.log('[deleteApplicant] Called with:', {
    userId: user?.id,
    userEmail: user?.email,
    companyId,
    jobId,
    applicantId,
  });

  // First, check if the applicant exists and verify permissions
  const { data: existingApplicant, error: checkError } = await supabase
    .from("applicants")
    .select("id, company_id, job_id, full_name")
    .eq("id", applicantId)
    .maybeSingle();

  console.log('[deleteApplicant] Pre-delete check:', {
    found: !!existingApplicant,
    applicant: existingApplicant,
    checkError: checkError?.message,
  });

  if (checkError) {
    console.error('[deleteApplicant] Pre-delete check failed:', checkError);
  }

  if (!existingApplicant) {
    console.error('[deleteApplicant] Applicant not found or no SELECT permission');
    throw new Error('Applicant not found or you do not have permission to view it.');
  }

  // Verify user is a company member
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role, account_id")
    .eq("user_id", user?.id || '')
    .maybeSingle();

  const { data: company } = await supabase
    .from("companies")
    .select("account_id")
    .eq("id", companyId)
    .maybeSingle();

  console.log('[deleteApplicant] Permission check:', {
    userMembership: membership,
    companyAccount: company?.account_id,
    hasPermission: membership?.account_id === company?.account_id,
  });

  // Attempt delete
  const { error, count } = await supabase
    .from("applicants")
    .delete({ count: 'exact' })
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) {
    console.error("[deleteApplicant] Supabase Error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(`Delete failed: ${error.message}`);
  }

  console.log('[deleteApplicant] Delete result:', {
    deletedCount: count,
    success: count === 1,
  });

  if (count === 0) {
    console.error('[deleteApplicant] CRITICAL: No rows deleted despite SELECT permission!', {
      applicantExists: !!existingApplicant,
      filters: { id: applicantId, company_id: companyId, job_id: jobId },
      possibleCauses: [
        'RLS DELETE policy blocking (user not admin/owner)',
        'company_id or job_id mismatch',
        'Applicant deleted by concurrent request',
      ],
    });
    throw new Error('Failed to delete applicant. You may not have delete permissions.');
  }

  console.log('[deleteApplicant] Successfully deleted applicant:', existingApplicant.full_name);

  revalidatePath(dashPath(companyId, jobId));
}

export async function duplicateApplicant(
  companyId: string,
  jobId: string,
  applicantId: string
) {
  const supabase = await createClient();

  // Get source applicant
  const { data: source, error: readErr } = await supabase
    .from("applicants")
    .select("*")
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .single();

  if (readErr || !source) {
    console.error("[duplicateApplicant] Applicant not found:", readErr);
    throw new Error("Applicant not found");
  }

  // Create duplicate
  const { data: newApplicant, error } = await supabase
    .from("applicants")
    .insert({
      company_id: source.company_id,
      full_name: `${source.full_name} (Copy)`,
      email: source.email ? `copy_${source.email}` : null,
      phone: source.phone,
      status: source.status,
      group_id: source.group_id,
      job_id: source.job_id,
      board_id: source.board_id,
      resume_path: source.resume_path,
      // NOTE: `applicants.position` is an INTEGER in Postgres, so it cannot store fractional values.
      // Place the duplicate immediately after the source row.
      position: (source.position ?? 0) + 1,
    })
    .select()
    .single();

  if (error) {
    console.error("[duplicateApplicant] Error creating duplicate:", error);
    throw new Error(error.message);
  }

  // Duplicate cell values
  const { data: cells } = await supabase
    .from("board_cells")
    .select("*")
    .eq("applicant_id", applicantId);

  if (cells && cells.length > 0 && newApplicant) {
    const { error: cellsError } = await supabase
      .from("board_cells")
      .insert(
        cells.map((cell) => ({
          applicant_id: newApplicant.id,
          column_id: cell.column_id,
          value_text: cell.value_text,
          value_number: cell.value_number,
          value_date: cell.value_date,
          value_status_label_id: cell.value_status_label_id,
        }))
      );

    if (cellsError) {
      console.error("[duplicateApplicant] Error duplicating cells:", cellsError);
    }
  }

  revalidatePath(dashPath(companyId, jobId));
  return newApplicant;
}

export async function reorderApplicants(
  companyId: string,
  jobId: string,
  applicantId: string,
  newPosition: number,
  groupId: string | null
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .update({ position: newPosition, group_id: groupId })
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) {
    console.error("[reorderApplicants] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}

export async function reorderColumns(
  companyId: string,
  jobId: string,
  columnId: string,
  newSortOrder: number
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_columns")
    .update({ sort_order: newSortOrder })
    .eq("id", columnId)
    .eq("company_id", companyId);

  if (error) {
    console.error("[reorderColumns] Error:", error);
    throw new Error(error.message);
  }

  revalidatePath(dashPath(companyId, jobId));
}
