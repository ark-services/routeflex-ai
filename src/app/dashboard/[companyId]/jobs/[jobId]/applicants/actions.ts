"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateEmail, validatePhone, validateLocation } from "@/lib/validation/columnValidation";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";
import { getOrCreateApplicantsBoard as getOrCreateBoardLib } from "@/lib/boards/getOrCreateApplicantsBoard";
import { actorName } from "@/lib/helpers/actorName";
import { getGmailClientForCompany, sendEmail } from "@/lib/gmail-send";
import { resolveVariables, plainTextToHtml } from "@/lib/automations/executors/helpers";

const VERBOSE = false; // set to true to re-enable verbose action logs

function dashPath(companyId: string, jobId: string) {
  return `/dashboard/${companyId}/jobs/${jobId}/applicants`;
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

  // Get current user info for debugging
  const { data: { user } } = await supabase.auth.getUser();

  if (VERBOSE) console.log('[bulkMoveApplicants] Called with:', {
    userId: user?.id,
    userEmail: user?.email,
    companyId,
    jobId,
    applicantIds,
    requestedCount: applicantIds.length,
    targetGroupId: groupId,
  });

  // First, check which applicants exist and are visible
  const { data: existingApplicants, error: checkError } = await supabase
    .from("applicants")
    .select("id, full_name, group_id")
    .in("id", applicantIds);

  if (VERBOSE) console.log('[bulkMoveApplicants] Pre-move check:', {
    requestedCount: applicantIds.length,
    foundCount: existingApplicants?.length || 0,
    applicants: existingApplicants?.map(a => ({ id: a.id, name: a.full_name, currentGroup: a.group_id })),
    checkError: checkError?.message,
  });

  if (checkError) {
    console.error('[bulkMoveApplicants] Pre-move check failed:', checkError);
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

  if (VERBOSE) console.log('[bulkMoveApplicants] Permission check:', {
    userMembership: membership,
    companyAccount: company?.account_id,
    hasPermission: membership?.account_id === company?.account_id,
    userRole: membership?.role,
  });

  // Verify target group exists
  const { data: targetGroup } = await supabase
    .from("board_groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();

  if (VERBOSE) console.log('[bulkMoveApplicants] Target group check:', {
    groupId,
    groupExists: !!targetGroup,
    groupName: targetGroup?.name,
  });

  if (!targetGroup) {
    throw new Error(`Target group ${groupId} not found`);
  }

  // Attempt move with row count
  const { error, count } = await supabase
    .from("applicants")
    .update({ group_id: groupId }, { count: 'exact' })
    .in("id", applicantIds)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) {
    console.error("[bulkMoveApplicants] Supabase Error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(`Bulk move failed: ${error.message}`);
  }

  if (VERBOSE) console.log('[bulkMoveApplicants] Move result:', {
    movedCount: count,
    requestedCount: applicantIds.length,
    success: count === applicantIds.length,
    targetGroup: targetGroup.name,
  });

  if (count === 0) {
    console.error('[bulkMoveApplicants] CRITICAL: No rows updated!', {
      applicantsExist: existingApplicants && existingApplicants.length > 0,
      requestedIds: applicantIds,
      foundIds: existingApplicants?.map(a => a.id),
      targetGroupId: groupId,
      possibleCauses: [
        'RLS UPDATE policy blocking (check migration 00027)',
        'company_id or job_id mismatch in WHERE clause',
        'Applicants already deleted',
        'Target group belongs to different board/company',
      ],
    });
    throw new Error('Failed to move applicants. You may not have update permissions, or the applicants/group do not exist.');
  }

  if (count !== applicantIds.length) {
    if (VERBOSE) console.warn('[bulkMoveApplicants] Partial move:', {
      requested: applicantIds.length,
      moved: count,
      missing: applicantIds.length - (count || 0),
    });
  }

  if (VERBOSE) console.log(`[bulkMoveApplicants] ✓ Successfully moved ${count} applicant(s) to ${targetGroup.name}`);

  // Log activity
  try {
    const actor = actorName(user);
    const n = count ?? applicantIds.length;
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user?.id ?? null,
      actorType: "user",
      eventType: "applicant.moved_group",
      entityType: "applicant",
      summary: `${actor} moved ${n} applicant${n !== 1 ? "s" : ""} to ${targetGroup.name}`,
      data: { actor_name: actor, group_name: targetGroup.name, count: n },
    });
  } catch {}

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

  if (VERBOSE) console.log('[bulkDeleteApplicants] Called with:', {
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

  if (VERBOSE) console.log('[bulkDeleteApplicants] Pre-delete check:', {
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

  if (VERBOSE) console.log('[bulkDeleteApplicants] Permission check:', {
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

  if (VERBOSE) console.log('[bulkDeleteApplicants] Delete result:', {
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
    if (VERBOSE) console.warn('[bulkDeleteApplicants] Partial delete:', {
      requested: applicantIds.length,
      deleted: count,
      missing: applicantIds.length - (count || 0),
    });
  }

  if (VERBOSE) console.log(`[bulkDeleteApplicants] Successfully deleted ${count} applicant(s)`);

  revalidatePath(dashPath(companyId, jobId));
}

type GroupRow = { id: string; name: string; color: string; sort_order: number; is_collapsed: boolean };

/** Returns true when a Supabase/PostgREST error is a Postgres unique-violation (23505). */
function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" ||
    (error.message ?? "").includes("23505") ||
    (error.message ?? "").includes("duplicate key") ||
    (error.message ?? "").includes("board_groups_board_name_unique_idx") ||
    (error.message ?? "").includes("board_groups_board_name_idx")
  );
}

export async function createGroup(
  companyId: string,
  jobId: string,
  boardId: string,
  /** Base name hint — "New Group" by default. The action finds the first
   *  available variant (New Group → New Group 2 → New Group 3 …). */
  name: string,
  color?: string
): Promise<{ data?: GroupRow; error?: string }> {
  const supabase = await createClient();

  // Default colors cycle (RouteFlex brand palette)
  const defaultColors = ['#1D6FFF', '#16A34A', '#D97706', '#EF4444', '#0A4FCC', '#4D8FFF', '#4A5568', '#9BAABB'];

  // Place the new group at the end of the board.
  const { data: existing, error: readErr } = await supabase
    .from("board_groups")
    .select("sort_order")
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (readErr) {
    console.error("[createGroup] Error reading existing groups:", readErr);
    return { error: readErr.message };
  }

  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;
  const groupColor = color || defaultColors[nextSort % defaultColors.length];

  // Retry loop: try "New Group", then "New Group 2", "New Group 3", …
  // Handles concurrent clicks and multi-user race conditions via 23505 detection.
  const MAX_RETRIES = 50;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const candidateName = attempt === 0 ? name : `${name} ${attempt + 1}`;

    const { data, error } = await supabase
      .from("board_groups")
      .insert({
        company_id: companyId,
        board_id: boardId,
        name: candidateName,
        sort_order: nextSort,
        color: groupColor,
      })
      .select("id, name, color, sort_order, is_collapsed")
      .single();

    if (!error) {
      // Log activity
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const actor = actorName(user);
        await logActivityEvent(supabase, {
          companyId,
          jobId,
          actorUserId: user?.id ?? null,
          actorType: "user",
          eventType: "group.created",
          entityType: "group",
          entityId: data.id,
          summary: `${actor} created group "${data.name}"`,
          data: { actor_name: actor, group_name: data.name },
        });
      } catch {}

      revalidatePath(dashPath(companyId, jobId));
      return { data: data as GroupRow };
    }

    if (!isUniqueViolation(error)) {
      // Non-unique error — bail immediately.
      console.error("[createGroup] Error creating group:", error);
      return { error: error.message };
    }

    // Unique violation — try the next candidate name.
  }

  return { error: `Could not find a unique group name after ${MAX_RETRIES} attempts.` };
}

export async function updateGroupCollapsedColumns(
  companyId: string,
  jobId: string,
  boardId: string,
  groupId: string,
  collapsedColumns: string[]
) {
  const supabase = await createClient();
  await supabase
    .from("board_groups")
    .update({ settings: { collapsed_columns: collapsedColumns } })
    .eq("id", groupId)
    .eq("company_id", companyId)
    .eq("board_id", boardId);
  revalidatePath(dashPath(companyId, jobId));
}

export async function updateGroupHiddenColumns(
  companyId: string,
  jobId: string,
  boardId: string,
  groupId: string,
  hiddenColumns: string[]
) {
  const supabase = await createClient();
  // Merge into existing settings to preserve other keys (collapsed_columns, etc.)
  const { data: group } = await supabase
    .from("board_groups")
    .select("settings")
    .eq("id", groupId)
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .single();
  const newSettings = { ...(group?.settings ?? {}), hidden_columns: hiddenColumns };
  await supabase
    .from("board_groups")
    .update({ settings: newSettings })
    .eq("id", groupId)
    .eq("company_id", companyId)
    .eq("board_id", boardId);
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

  // Log activity
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const actor = actorName(user);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user?.id ?? null,
      actorType: "user",
      eventType: "group.renamed",
      entityType: "group",
      entityId: groupId,
      summary: `${actor} renamed group to "${trimmedName}"`,
      data: { actor_name: actor, group_name: trimmedName },
    });
  } catch {}

  revalidatePath(dashPath(companyId, jobId));
}

export async function deleteGroup(
  companyId: string,
  jobId: string,
  boardId: string,
  groupId: string
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();

  // Fetch the name of the group being deleted for the activity log
  const { data: deletedGroupInfo } = await supabase
    .from("board_groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();

  // Fetch all groups for board (sorted by sort_order)
  const { data: groups, error: fetchError } = await supabase
    .from("board_groups")
    .select("id, sort_order")
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true });

  if (fetchError) {
    console.error("[deleteGroup] Error fetching groups:", fetchError);
    return { error: fetchError.message };
  }

  // Prevent deletion if only 1 group remains — return structured error, never throw,
  // so Next.js does not show the runtime error overlay.
  if (!groups || groups.length <= 1) {
    return { error: "Cannot delete the last group" };
  }

  // Find first group that isn't being deleted (target group)
  const targetGroup = groups.find((g) => g.id !== groupId);
  if (!targetGroup) {
    return { error: "No target group found for applicant migration" };
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
    return { error: moveError.message };
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
    return { error: deleteError.message };
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

  // Log activity
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const actor = actorName(user);
    const gName = deletedGroupInfo?.name ?? "a group";
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user?.id ?? null,
      actorType: "user",
      eventType: "group.deleted",
      entityType: "group",
      entityId: groupId,
      summary: `${actor} deleted group "${gName}"`,
      data: { actor_name: actor, group_name: gName },
    });
  } catch {}

  revalidatePath(dashPath(companyId, jobId));
  return { success: true };
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
  columnType: "text" | "number" | "date" | "file" | "status" | "email" | "phone" | "location" | "fadv.package" | "fadv.location" | "fadv.facility_id" | "fadv.position_type",
  afterColumnId?: string
) {
  const supabase = await createClient();

  // Get or create the job-scoped Applicants board (uses service-role internally)
  const boardResult = await getOrCreateBoardLib(supabase, companyId, jobId);
  if (!boardResult.success) {
    throw new Error(boardResult.error);
  }
  const boardId = boardResult.board.id;

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
      // Shift all columns to the right by +1
      // Fetch columns that need to be shifted
      const { data: columnsToShift } = await supabase
        .from("board_columns")
        .select("id, sort_order")
        .eq("board_id", boardId)
        .eq("company_id", companyId)
        .gt("sort_order", afterColumn.sort_order)
        .order("sort_order", { ascending: false }); // Shift from highest to lowest to avoid conflicts

      // Update each column's sort_order
      if (columnsToShift && columnsToShift.length > 0) {
        for (const col of columnsToShift) {
          await supabase
            .from("board_columns")
            .update({ sort_order: col.sort_order + 1 })
            .eq("id", col.id)
            .eq("company_id", companyId);
        }
      }

      targetSortOrder = afterColumn.sort_order + 1;
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

    // Handle duplicate column name error
    if (error.code === "23505" || error.message?.includes("board_columns_board_name_idx")) {
      return {
        success: false,
        error: "A column with this name already exists on this board.",
        code: 409,
      };
    }

    // Other errors
    return {
      success: false,
      error: error.message,
      code: 500,
    };
  }

  revalidatePath(dashPath(companyId, jobId));
  return {
    success: true,
    data,
  };
}

export async function duplicateBoardColumn(
  companyId: string,
  jobId: string,
  columnId: string,
  withValues = false
) {
  const supabase = await createClient();

  // Get or create the job-scoped Applicants board (uses service-role internally)
  const boardResult = await getOrCreateBoardLib(supabase, companyId, jobId);
  if (!boardResult.success) {
    throw new Error(boardResult.error);
  }
  const boardId = boardResult.board.id;

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

    // Handle duplicate column name error
    if (error.code === "23505" || error.message?.includes("board_columns_board_name_idx")) {
      throw new Error("A column with this name already exists on this board.");
    }

    throw new Error(error.message);
  }

  // For status columns: duplicate the labels (always needed so cells can reference them)
  const labelIdMap = new Map<string, string>(); // old label id → new label id
  if (sourceColumn.type === "status" && newColumn) {
    const { data: labels } = await supabase
      .from("board_status_labels")
      .select("*")
      .eq("column_id", columnId)
      .order("sort_order", { ascending: true });

    if (labels && labels.length > 0) {
      const { data: newLabels, error: labelError } = await supabase
        .from("board_status_labels")
        .insert(
          labels.map((label) => ({
            column_id: newColumn.id,
            label: label.label,
            color: label.color,
            sort_order: label.sort_order,
          }))
        )
        .select();

      if (labelError) {
        console.error("[duplicateBoardColumn] Error duplicating status labels:", labelError);
      } else if (newLabels) {
        // Build mapping from old label id → new label id (by sort_order position)
        labels.forEach((oldLabel, i) => {
          if (newLabels[i]) labelIdMap.set(oldLabel.id, newLabels[i].id);
        });
      }
    }
  }

  // Copy cell values if requested
  if (withValues && newColumn) {
    const { data: cells } = await supabase
      .from("board_cells")
      .select("*")
      .eq("column_id", columnId);

    if (cells && cells.length > 0) {
      const { error: cellError } = await supabase
        .from("board_cells")
        .insert(
          cells.map((cell) => ({
            applicant_id: cell.applicant_id,
            column_id: newColumn.id,
            value_text: cell.value_text,
            value_number: cell.value_number,
            value_date: cell.value_date,
            value_bool: cell.value_bool,
            value_file_path: cell.value_file_path,
            value_status_label_id: cell.value_status_label_id
              ? (labelIdMap.get(cell.value_status_label_id) ?? null)
              : null,
          }))
        );

      if (cellError) {
        console.error("[duplicateBoardColumn] Error copying cell values:", cellError);
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
  updates: { name?: string; sort_order?: number; is_hidden?: boolean; settings?: any }
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

  // Skip revalidatePath for visibility-only changes.
  // `is_hidden` is managed optimistically on the client; a full RSC re-render
  // races with the 1500 ms router.refresh() used after status-change automations
  // and can overwrite the local hide/show state before the DB write is visible.
  // Structural changes (name, sort_order, settings) still need revalidation so
  // column headers and ordering stay in sync across the board.
  const isVisibilityOnly =
    updates.is_hidden !== undefined &&
    updates.name === undefined &&
    updates.sort_order === undefined &&
    updates.settings === undefined;

  if (!isVisibilityOnly) {
    revalidatePath(dashPath(companyId, jobId));
  }
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

  // Get all existing labels for this column
  const { data: existing, error: readErr } = await supabase
    .from("board_status_labels")
    .select("id, sort_order, color")
    .eq("column_id", columnId)
    .order("sort_order", { ascending: false });

  if (readErr) {
    console.error("[createStatusLabel] Error reading existing labels:", readErr);
    throw new Error(readErr.message);
  }

  // Check if we've reached the 25-label limit
  if (existing && existing.length >= 25) {
    throw new Error("Maximum of 25 status labels reached for this column. Please delete an existing label to add a new one.");
  }

  // Check if color is already in use
  const colorInUse = existing?.some((l) => l.color === color);
  if (colorInUse) {
    throw new Error("This color is already used by another label. Please choose a different color.");
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

    // Check if it's a unique constraint violation
    if (error.code === '23505') {
      throw new Error("This color is already used by another label. Please choose a different color.");
    }

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

  if (VERBOSE) console.log("[updateStatusLabel] ========================================");
  if (VERBOSE) console.log("[updateStatusLabel] Input:", {
    labelId,
    updates,
    companyId,
    jobId,
  });

  // Fetch the label first to get column_id for scoping
  const { data: existingLabel, error: fetchError } = await supabase
    .from("board_status_labels")
    .select("id, column_id, label, color")
    .eq("id", labelId)
    .single();

  if (fetchError || !existingLabel) {
    console.error("[updateStatusLabel] Failed to fetch label:", fetchError);
    throw new Error("Label not found");
  }

  if (VERBOSE) console.log("[updateStatusLabel] Existing label before update:", existingLabel);

  // If updating color, check for uniqueness constraint
  if (updates.color && updates.color !== existingLabel.color) {
    const { data: existingColorLabel } = await supabase
      .from("board_status_labels")
      .select("id, label")
      .eq("column_id", existingLabel.column_id)
      .eq("color", updates.color)
      .neq("id", labelId)
      .maybeSingle();

    if (existingColorLabel) {
      console.error("[updateStatusLabel] Color already in use:", {
        color: updates.color,
        existingLabelId: existingColorLabel.id,
        existingLabelName: existingColorLabel.label,
      });
      throw new Error(`This color is already used by "${existingColorLabel.label}". Please choose a different color.`);
    }
  }

  // Get column and board info for permission verification
  const { data: column } = await supabase
    .from("board_columns")
    .select("board_id, company_id")
    .eq("id", existingLabel.column_id)
    .single();

  if (VERBOSE) console.log("[updateStatusLabel] Column info:", column);

  // Perform update and return data to confirm it worked
  const { data: updatedLabel, error, count } = await supabase
    .from("board_status_labels")
    .update(updates)
    .eq("id", labelId)
    .select("id, label, color, column_id, sort_order")
    .single();

  if (error) {
    console.error("[updateStatusLabel] Supabase Error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      labelId,
      updates,
    });

    // Check if it's a unique constraint violation
    if (error.code === '23505') {
      throw new Error("This color is already used by another label in this column. Please choose a different color.");
    }

    throw new Error(error.message);
  }

  if (VERBOSE) console.log("[updateStatusLabel] ✓ Update successful");
  if (VERBOSE) console.log("[updateStatusLabel] Updated label:", updatedLabel);
  if (VERBOSE) console.log("[updateStatusLabel] Rows affected:", count || 1);
  if (VERBOSE) console.log("[updateStatusLabel] ========================================");

  // Revalidate the path so the board reflects changes when modal closes
  revalidatePath(dashPath(companyId, jobId));

  return updatedLabel;
}

export async function deleteStatusLabel(
  companyId: string,
  jobId: string,
  labelId: string
) {
  const supabase = await createClient();

  if (VERBOSE) console.log("[deleteStatusLabel] Starting safe delete:", {
    labelId,
    companyId,
    jobId,
  });

  // Step 1: Get the label being deleted and its column
  const { data: labelToDelete, error: fetchError } = await supabase
    .from("board_status_labels")
    .select("id, label, column_id, sort_order")
    .eq("id", labelId)
    .single();

  if (fetchError || !labelToDelete) {
    console.error("[deleteStatusLabel] Label not found:", fetchError);
    throw new Error("Label not found");
  }

  if (VERBOSE) console.log("[deleteStatusLabel] Label to delete:", labelToDelete);

  // Step 2: Get all labels for this column to find the fallback
  const { data: allLabels, error: labelsError } = await supabase
    .from("board_status_labels")
    .select("id, label, sort_order")
    .eq("column_id", labelToDelete.column_id)
    .order("sort_order", { ascending: true });

  if (labelsError || !allLabels || allLabels.length === 0) {
    console.error("[deleteStatusLabel] Error fetching column labels:", labelsError);
    throw new Error("Failed to fetch column labels");
  }

  if (VERBOSE) console.log("[deleteStatusLabel] All labels in column:", allLabels);

  // Step 3: Determine fallback label (first label or one named "None")
  let fallbackLabel = allLabels.find((l) => l.label.toLowerCase() === "none");
  if (!fallbackLabel) {
    fallbackLabel = allLabels[0];
  }

  if (VERBOSE) console.log("[deleteStatusLabel] Fallback label:", fallbackLabel);

  // Step 4: Prevent deletion of the fallback label
  if (labelToDelete.id === fallbackLabel?.id) {
    const errorMsg = "Cannot delete the default label. It is used as a fallback when other labels are deleted.";
    console.error("[deleteStatusLabel] Attempted to delete fallback label:", {
      labelId: labelToDelete.id,
      labelName: labelToDelete.label,
    });
    throw new Error(errorMsg);
  }

  // Step 5: Prevent deletion if it's the last label
  if (allLabels.length <= 1) {
    throw new Error("Cannot delete the last label in this column");
  }

  // Step 6: Get board_id for scoping (needed for RLS)
  const { data: column, error: columnError } = await supabase
    .from("board_columns")
    .select("board_id, company_id")
    .eq("id", labelToDelete.column_id)
    .single();

  if (columnError || !column) {
    console.error("[deleteStatusLabel] Error fetching column:", columnError);
    throw new Error("Failed to fetch column information");
  }

  if (VERBOSE) console.log("[deleteStatusLabel] Column info:", column);

  // Step 7: Reassign all cells using this label to the fallback label (ATOMIC TRANSACTION)
  // First, count how many cells will be affected
  const { count: affectedCells } = await supabase
    .from("board_cells")
    .select("*", { count: "exact", head: true })
    .eq("value_status_label_id", labelId)
    .eq("column_id", labelToDelete.column_id);

  if (VERBOSE) console.log("[deleteStatusLabel] Cells to reassign:", affectedCells);

  // Reassign cells to fallback label
  if (affectedCells && affectedCells > 0) {
    const { error: reassignError } = await supabase
      .from("board_cells")
      .update({ value_status_label_id: fallbackLabel.id })
      .eq("value_status_label_id", labelId)
      .eq("column_id", labelToDelete.column_id);

    if (reassignError) {
      console.error("[deleteStatusLabel] Error reassigning cells:", reassignError);
      throw new Error(`Failed to reassign cells: ${reassignError.message}`);
    }

    if (VERBOSE) console.log(`[deleteStatusLabel] Successfully reassigned ${affectedCells} cells to fallback label:`, {
      fromLabel: labelToDelete.label,
      toLabel: fallbackLabel.label,
      cellsReassigned: affectedCells,
    });
  }

  // Step 8: Now safe to delete the label
  const { error: deleteError } = await supabase
    .from("board_status_labels")
    .delete()
    .eq("id", labelId);

  if (deleteError) {
    console.error("[deleteStatusLabel] Error deleting label:", deleteError);
    throw new Error(`Failed to delete label: ${deleteError.message}`);
  }

  if (VERBOSE) console.log("[deleteStatusLabel] ✓ Successfully deleted label:", {
    labelId: labelToDelete.id,
    labelName: labelToDelete.label,
    cellsReassigned: affectedCells || 0,
    fallbackLabel: fallbackLabel.label,
  });

  // Do NOT call revalidatePath here - let the UI handle optimistic updates
}

export async function reorderStatusLabels(
  companyId: string,
  jobId: string,
  labelOrders: { id: string; sort_order: number }[]
) {
  const supabase = await createClient();

  // Update each label's sort_order in parallel
  await Promise.all(
    labelOrders.map(({ id, sort_order }) =>
      supabase
        .from("board_status_labels")
        .update({ sort_order })
        .eq("id", id)
    )
  );

  // Do NOT call revalidatePath here - let the UI handle optimistic updates
}

/** Returns the form field option texts linked to a board column (select/radio only), or [] if not linked. */
export async function getColumnFormOptions(
  companyId: string,
  jobId: string,
  columnId: string
): Promise<string[]> {
  const supabase = await createClient();

  // Get the column's linked field_id
  const { data: column } = await supabase
    .from("board_columns")
    .select("field_id")
    .eq("id", columnId)
    .single();

  if (!column?.field_id) return [];

  // Fetch the linked form field — only select/radio have options
  const { data: field } = await supabase
    .from("job_application_fields")
    .select("settings, type")
    .eq("id", column.field_id)
    .in("type", ["select", "radio"])
    .single();

  if (!field) return [];

  const options = (field.settings as any)?.options;
  if (!Array.isArray(options)) return [];

  return options.filter((o: unknown): o is string => typeof o === "string");
}

// ===== Board Cell Actions =====

export type CellUpdateResult =
  | { ok: true }
  | { ok: false; kind: "validation" | "server"; message: string };

export async function updateBoardCell(
  companyId: string,
  jobId: string,
  applicantId: string,
  columnId: string,
  columnType: "text" | "number" | "date" | "status" | "checkbox" | "email" | "phone" | "location" | "file" | "fadv.package" | "fadv.location" | "fadv.facility_id" | "fadv.position_type",
  value: any
): Promise<CellUpdateResult> {
  // UUID validation regex
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Log all parameters for debugging
  if (VERBOSE) console.log('[updateBoardCell] Called with parameters:', {
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
      return { ok: false, kind: "server", message: "Invalid request" };
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

  // For non-status/non-file columns, capture old value before update (for activity logging + undo)
  let oldNonStatusCell: { value_text: string | null; value_number: number | null; value_date: string | null; value_bool: boolean | null } | null = null;
  if (columnType !== "status" && columnType !== "file") {
    const { data: existingNonStatusCell } = await supabase
      .from("board_cells")
      .select("value_text, value_number, value_date, value_bool")
      .eq("applicant_id", applicantId)
      .eq("column_id", columnId)
      .maybeSingle();
    oldNonStatusCell = existingNonStatusCell ?? null;
  }

  // Map value to appropriate column based on type
  const cellData: any = {
    applicant_id: applicantId,
    column_id: columnId,
    value_text: null,
    value_number: null,
    value_date: null,
    value_bool: null,
    value_status_label_id: null,
    value_file_path: null,
  };

  if (columnType === "checkbox") {
    cellData.value_bool = Boolean(value);
  } else if (columnType === "text") {
    cellData.value_text = value;
  } else if (columnType === "number") {
    cellData.value_number = value;
  } else if (columnType === "date") {
    cellData.value_date = value;
  } else if (columnType === "status") {
    cellData.value_status_label_id = value;
  } else if (columnType === "email") {
    // Allow clearing the field
    if (value === null || value === undefined || String(value).trim() === '') {
      cellData.value_text = null;
    } else {
      const validation = validateEmail(value);
      if (!validation.valid) {
        return { ok: false, kind: "validation", message: validation.error || "Please enter a valid email address" };
      }
      cellData.value_text = value.trim();
    }
  } else if (columnType === "phone") {
    // Allow clearing the field
    if (value === null || value === undefined || String(value).trim() === '') {
      cellData.value_text = null;
    } else {
      // Validate and normalize to E.164
      const validation = validatePhone(value);
      if (!validation.valid) {
        return { ok: false, kind: "validation", message: validation.error || "Invalid phone number" };
      }
      cellData.value_text = validation.normalized ?? null;
    }
  } else if (columnType === "location") {
    // Validate location
    const validation = validateLocation(value);
    if (!validation.valid) {
      return { ok: false, kind: "validation", message: validation.error || "Invalid location" };
    }
    cellData.value_text = value.trim();
  } else if (columnType === "file") {
    // value is StoredFile[] — JSON-encode the array, store first path for backward compat
    if (Array.isArray(value) && value.length > 0) {
      cellData.value_text = JSON.stringify(value);
      cellData.value_file_path = value[0].path;
    } else {
      cellData.value_text = null;
      cellData.value_file_path = null;
    }
  } else if (
    columnType === "fadv.package" ||
    columnType === "fadv.location" ||
    columnType === "fadv.facility_id" ||
    columnType === "fadv.position_type"
  ) {
    // FADV integration-backed column: store text in board_cells AND sync to
    // applicant_integration_fields for submission validation.
    const trimmed = value !== null && value !== undefined ? String(value).trim() : null;
    cellData.value_text = trimmed || null;
  }

  if (VERBOSE) console.log('[updateBoardCell] Upserting cell data:', cellData);

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
    return { ok: false, kind: "server", message: "Something went wrong. Please try again." };
  }

  if (VERBOSE) console.log('[updateBoardCell] Success:', data);

  // Sync applicants.full_name when a First Name or Last Name text cell is saved.
  // quickCreateApplicant sets full_name = "New Applicant" as a placeholder; once
  // the user fills in the name cells we need to keep full_name in sync so that
  // automation variable substitution ({{first_name}}) gets the real name.
  if (columnType === "text") {
    try {
      const { data: thisCol } = await supabase
        .from("board_columns")
        .select("name")
        .eq("id", columnId)
        .maybeSingle();

      const cn = thisCol?.name?.toLowerCase().trim() ?? "";
      if (cn === "first name" || cn === "firstname" || cn === "last name" || cn === "lastname") {
        // Re-fetch all name cells for this applicant after the upsert has committed
        const { data: nameCells } = await supabase
          .from("board_cells")
          .select("value_text, board_columns!inner(name)")
          .eq("applicant_id", applicantId);

        let firstName = "";
        let lastName  = "";
        for (const cell of nameCells ?? []) {
          const cellColName = (cell as any).board_columns?.name?.toLowerCase().trim() ?? "";
          if (cellColName === "first name" || cellColName === "firstname") {
            firstName = (cell as any).value_text ?? "";
          } else if (cellColName === "last name" || cellColName === "lastname") {
            lastName = (cell as any).value_text ?? "";
          }
        }

        const newFullName = [firstName, lastName].filter(Boolean).join(" ");
        if (newFullName) {
          await supabase.from("applicants").update({ full_name: newFullName }).eq("id", applicantId);
          if (VERBOSE) console.log("[updateBoardCell] Synced full_name →", newFullName);
        }
      }
    } catch (syncErr) {
      console.error("[updateBoardCell] full_name sync error (non-fatal):", syncErr);
    }
  }

  // Sync FADV columns to applicant_integration_fields
  if (
    columnType === "fadv.package" ||
    columnType === "fadv.location" ||
    columnType === "fadv.facility_id" ||
    columnType === "fadv.position_type"
  ) {
    const fieldKeyMap: Record<string, string> = {
      "fadv.package":       "package",
      "fadv.location":      "location",
      "fadv.facility_id":   "facility_id",
      "fadv.position_type": "position_type",
    };
    const fieldKey = fieldKeyMap[columnType];
    const trimmed = value !== null && value !== undefined ? String(value).trim() : null;

    try {
      // Fetch existing fields row to merge
      const { data: existing } = await supabase
        .from("applicant_integration_fields")
        .select("fields")
        .eq("applicant_id", applicantId)
        .eq("provider", "fadv")
        .maybeSingle();

      const existingFields = (existing?.fields ?? {}) as Record<string, string | null>;
      const updatedFields = { ...existingFields, [fieldKey]: trimmed };

      await supabase
        .from("applicant_integration_fields")
        .upsert(
          {
            applicant_id: applicantId,
            company_id: companyId,
            job_id: jobId,
            provider: "fadv",
            fields: updatedFields,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "applicant_id,provider" }
        );
    } catch (syncErr) {
      console.error("[updateBoardCell] Failed to sync FADV field to applicant_integration_fields:", syncErr);
      // Non-fatal: board_cells already updated successfully
    }
  }

  // Pre-capture user before after() — cookie context is unavailable post-response
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  // TRIGGER AUTOMATION: Detect status change and fire Monday.com-style trigger.
  // Wrapped in after() so automations run after the response is sent — doesn't block the client.
  if (columnType === "status" && oldStatusLabelId !== value) {
    after(async () => {
      try {
        // Service role client — no cookies needed, safe to use inside after()
        const svc = createServiceClient();

        // Import fireJobTrigger dynamically to avoid circular dependencies
        const { fireJobTrigger } = await import("@/lib/automations/fireJobAutomation");

        // Get column name for logging
        const { data: column } = await svc
          .from("board_columns")
          .select("name, board_id")
          .eq("id", columnId)
          .single();

        // Get label text for old and new values
        let oldLabel: string | null = null;
        let newLabel: string | null = null;

        if (oldStatusLabelId) {
          const { data: oldLabelData } = await svc
            .from("board_status_labels")
            .select("label")
            .eq("id", oldStatusLabelId)
            .single();
          oldLabel = oldLabelData?.label || null;
        }

        if (value) {
          const { data: newLabelData } = await svc
            .from("board_status_labels")
            .select("label")
            .eq("id", value)
            .single();
          newLabel = newLabelData?.label || null;
        }

        // Fire the board.status_changes_to trigger
        await fireJobTrigger(svc, {
          companyId,
          jobId,
          trigger_key: "board.status_changes_to",
          subject_type: "applicant",
          subject_id: applicantId,
          payload: {
            company_id: companyId,
            job_id: jobId,
            board_id: column?.board_id,
            applicant_id: applicantId,
            column_id: columnId,
            column_name: column?.name || "Unknown Column",
            old_value: oldStatusLabelId,
            new_value: value,
            old_label: oldLabel,
            new_label: newLabel,
          },
        });

        if (VERBOSE) console.log('[updateBoardCell] Automation trigger fired:', {
          trigger: 'board.status_changes_to',
          column: column?.name,
          oldLabel,
          newLabel,
        });

        // Log cell.updated activity
        try {
          const actor = actorName(currentUser);
          const { data: applicantRow } = await svc
            .from("applicants")
            .select("full_name")
            .eq("id", applicantId)
            .maybeSingle();
          const applicantName = applicantRow?.full_name ?? "an applicant";
          await logActivityEvent(svc, {
            companyId,
            jobId,
            actorUserId: currentUser?.id ?? null,
            actorType: "user",
            eventType: "cell.updated",
            entityType: "applicant",
            entityId: applicantId,
            summary: `${actor} changed ${applicantName}'s ${column?.name ?? "status"}`,
            data: {
              actor_name: actor,
              applicant_name: applicantName,
              applicant_id: applicantId,
              column_id: columnId,
              column_name: column?.name,
              column_type: "status",
              old_value: oldStatusLabelId,
              new_value: value,
              old_label: oldLabel,
              new_label: newLabel,
            },
          });
        } catch {}
      } catch (automationError) {
        console.error('[updateBoardCell] Error firing automation:', automationError);
      }
    });
  }

  // LOG CELL CHANGE: For non-status, non-file columns log cell.updated with old/new values
  if (columnType !== "status" && columnType !== "file") {
    after(async () => {
      try {
        const svc = createServiceClient();
        const actor = actorName(currentUser);
        const [{ data: column }, { data: applicantRow }] = await Promise.all([
          svc.from("board_columns").select("name").eq("id", columnId).maybeSingle(),
          svc.from("applicants").select("full_name").eq("id", applicantId).maybeSingle(),
        ]);
        const colName = column?.name ?? "a field";
        const applicantName = applicantRow?.full_name ?? "an applicant";

        const oldValue = columnType === "number" ? (oldNonStatusCell?.value_number ?? null)
          : columnType === "date" ? (oldNonStatusCell?.value_date ?? null)
          : columnType === "checkbox" ? (oldNonStatusCell?.value_bool ?? null)
          : (oldNonStatusCell?.value_text ?? null);
        const newValue = columnType === "number" ? cellData.value_number
          : columnType === "date" ? cellData.value_date
          : columnType === "checkbox" ? cellData.value_bool
          : cellData.value_text;

        // Skip logging if nothing actually changed
        if (String(oldValue ?? "") === String(newValue ?? "")) return;

        await logActivityEvent(svc, {
          companyId,
          jobId,
          actorUserId: currentUser?.id ?? null,
          actorType: "user",
          eventType: "cell.updated",
          entityType: "applicant",
          entityId: applicantId,
          summary: `${actor} changed ${applicantName}'s ${colName}`,
          data: {
            actor_name: actor,
            applicant_name: applicantName,
            applicant_id: applicantId,
            column_id: columnId,
            column_name: colName,
            column_type: columnType,
            old_value: oldValue,
            new_value: newValue,
          },
        });
      } catch (err) {
        console.error('[updateBoardCell] Failed to log cell.updated activity:', err);
      }
    });
  }

  // NOTE: revalidatePath intentionally omitted — cell values are handled
  // optimistically on the client (cellOverrides in ApplicantsBoard). A full
  // RSC re-render here would negate the instant UI update.
  return { ok: true };
}

/**
 * Bulk update status cells for multiple applicants
 * Triggers automation for each applicant individually
 */
export async function bulkUpdateStatusCells(
  companyId: string,
  jobId: string,
  applicantIds: string[],
  columnId: string,
  statusLabelId: string
) {
  if (VERBOSE) console.log('[bulkUpdateStatusCells] Called with:', {
    companyId,
    jobId,
    applicantIds,
    applicantCount: applicantIds.length,
    columnId,
    statusLabelId,
  });

  const supabase = await createClient();

  // Get column info for automation triggers
  const { data: column } = await supabase
    .from("board_columns")
    .select("name, board_id, type")
    .eq("id", columnId)
    .single();

  if (!column) {
    throw new Error("Column not found");
  }

  if (column.type !== "status") {
    throw new Error("Column is not a status column");
  }

  // Get the new label text
  const { data: newLabelData } = await supabase
    .from("board_status_labels")
    .select("label")
    .eq("id", statusLabelId)
    .single();

  const newLabel = newLabelData?.label || null;

  if (VERBOSE) console.log('[bulkUpdateStatusCells] Column and label info:', {
    columnName: column.name,
    boardId: column.board_id,
    newLabel,
  });

  // Pre-capture user for activity logging
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  // Process each applicant individually to:
  // 1. Get the old status value
  // 2. Update the cell
  // 3. Fire automation trigger
  const results: { applicantId: string; success: true; oldValue: string | null }[] = [];
  const errors: { applicantId: string; error: string }[] = [];

  for (const applicantId of applicantIds) {
    try {
      // Fetch old value
      const { data: existingCell } = await supabase
        .from("board_cells")
        .select("value_status_label_id")
        .eq("applicant_id", applicantId)
        .eq("column_id", columnId)
        .single();

      const oldStatusLabelId = existingCell?.value_status_label_id ?? null;

      // Get old label text
      let oldLabel: string | null = null;
      if (oldStatusLabelId) {
        const { data: oldLabelData } = await supabase
          .from("board_status_labels")
          .select("label")
          .eq("id", oldStatusLabelId)
          .single();
        oldLabel = oldLabelData?.label || null;
      }

      // Update cell
      const cellData = {
        applicant_id: applicantId,
        column_id: columnId,
        value_text: null,
        value_number: null,
        value_date: null,
        value_status_label_id: statusLabelId,
      };

      const { error: updateError } = await supabase
        .from("board_cells")
        .upsert(cellData, {
          onConflict: "applicant_id,column_id",
        });

      if (updateError) {
        errors.push({ applicantId, error: updateError.message });
        console.error(`[bulkUpdateStatusCells] Failed to update applicant ${applicantId}:`, updateError);
        continue;
      }

      // Fire automation trigger (only if status actually changed).
      // Wrapped in after() so automations run after the response is sent.
      // Uses service role client inside after() — cookie-based client is unsafe post-response.
      if (oldStatusLabelId !== statusLabelId) {
        const _applicantId = applicantId;
        const _oldStatusLabelId = oldStatusLabelId;
        const _oldLabel = oldLabel;
        after(async () => {
          try {
            // Service role client — no cookies needed, safe to use inside after()
            const svc = createServiceClient();

            const { fireJobTrigger } = await import("@/lib/automations/fireJobAutomation");

            await fireJobTrigger(svc, {
              companyId,
              jobId,
              trigger_key: "board.status_changes_to",
              subject_type: "applicant",
              subject_id: _applicantId,
              payload: {
                company_id: companyId,
                job_id: jobId,
                board_id: column.board_id,
                applicant_id: _applicantId,
                column_id: columnId,
                column_name: column.name,
                old_value: _oldStatusLabelId,
                new_value: statusLabelId,
                old_label: _oldLabel,
                new_label: newLabel,
              },
            });

            if (VERBOSE) console.log(`[bulkUpdateStatusCells] Automation fired for applicant ${_applicantId}:`, {
              oldLabel: _oldLabel,
              newLabel,
            });
          } catch (automationError) {
            console.error(`[bulkUpdateStatusCells] Automation error for applicant ${_applicantId}:`, automationError);
          }
        });
      }

      results.push({ applicantId, success: true, oldValue: oldStatusLabelId });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      errors.push({ applicantId, error: errorMsg });
      console.error(`[bulkUpdateStatusCells] Error processing applicant ${applicantId}:`, err);
    }
  }

  if (VERBOSE) console.log('[bulkUpdateStatusCells] Bulk update complete:', {
    total: applicantIds.length,
    successful: results.length,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  });

  if (errors.length === applicantIds.length) {
    throw new Error("All bulk updates failed");
  }

  // Log ONE grouped cells.bulk_updated activity event after successful updates
  if (results.length > 0) {
    after(async () => {
      try {
        const svc = createServiceClient();
        const actor = actorName(currentUser);

        // Batch fetch applicant names
        const { data: applicantRows } = await svc
          .from("applicants")
          .select("id, full_name")
          .in("id", results.map(r => r.applicantId));
        const nameMap = new Map(applicantRows?.map(a => [a.id, a.full_name]) ?? []);

        // Build changes array
        const changes = results.map(r => ({
          applicant_id: r.applicantId,
          applicant_name: nameMap.get(r.applicantId) ?? "Unknown",
          old_value: r.oldValue,
        }));

        const summary = results.length === 1
          ? `${actor} changed ${changes[0].applicant_name}'s ${column.name}`
          : `${actor} updated ${column.name} for ${results.length} applicants`;

        await logActivityEvent(svc, {
          companyId,
          jobId,
          actorUserId: currentUser?.id ?? null,
          actorType: "user",
          eventType: "cells.bulk_updated",
          entityType: "applicant",
          entityId: null,
          summary,
          data: {
            actor_name: actor,
            column_id: columnId,
            column_name: column.name,
            column_type: "status",
            new_value: statusLabelId,
            new_label: newLabel,
            changes,
          },
        });
      } catch (err) {
        console.error('[bulkUpdateStatusCells] Failed to log activity:', err);
      }
    });
  }

  // NOTE: revalidatePath intentionally omitted — see updateBoardCell comment above.

  return {
    successful: results.length,
    failed: errors.length,
    errors,
  };
}

// ===== Bulk Text Cell Update =====

/**
 * Bulk update non-status cells for multiple applicants.
 * Logs ONE grouped cells.bulk_updated activity event (instead of N separate events).
 */
export async function bulkUpdateTextCells(
  companyId: string,
  jobId: string,
  applicantIds: string[],
  columnId: string,
  columnType: "text" | "number" | "date" | "checkbox" | "email" | "phone" | "location" | "fadv.package" | "fadv.location" | "fadv.facility_id" | "fadv.position_type",
  value: any
): Promise<{ successful: number; failed: number; errors: { applicantId: string; error: string }[] }> {
  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  // Get column info
  const { data: column } = await supabase
    .from("board_columns")
    .select("name, type")
    .eq("id", columnId)
    .single();

  if (!column) throw new Error("Column not found");

  // Batch fetch old cell values for all applicants
  const { data: existingCells } = await supabase
    .from("board_cells")
    .select("applicant_id, value_text, value_number, value_date, value_bool")
    .in("applicant_id", applicantIds)
    .eq("column_id", columnId);
  const oldCellMap = new Map(existingCells?.map(c => [c.applicant_id, c]) ?? []);

  // Build the new cell data (same for all rows)
  function buildCellData(applicantId: string) {
    const base: any = {
      applicant_id: applicantId,
      column_id: columnId,
      value_text: null,
      value_number: null,
      value_date: null,
      value_bool: null,
      value_status_label_id: null,
    };
    if (columnType === "checkbox") base.value_bool = Boolean(value);
    else if (columnType === "number") base.value_number = value;
    else if (columnType === "date") base.value_date = value;
    else base.value_text = value !== null && value !== undefined ? String(value).trim() || null : null;
    return base;
  }

  const results: { applicantId: string; success: true; oldValue: any }[] = [];
  const errors: { applicantId: string; error: string }[] = [];

  for (const applicantId of applicantIds) {
    try {
      const cellData = buildCellData(applicantId);
      const { error: updateError } = await supabase
        .from("board_cells")
        .upsert(cellData, { onConflict: "applicant_id,column_id" });

      if (updateError) {
        errors.push({ applicantId, error: updateError.message });
        continue;
      }

      const oldCell = oldCellMap.get(applicantId);
      const oldValue = columnType === "number" ? (oldCell?.value_number ?? null)
        : columnType === "date" ? (oldCell?.value_date ?? null)
        : columnType === "checkbox" ? (oldCell?.value_bool ?? null)
        : (oldCell?.value_text ?? null);

      results.push({ applicantId, success: true, oldValue });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      errors.push({ applicantId, error: errorMsg });
    }
  }

  if (errors.length === applicantIds.length) throw new Error("All bulk updates failed");

  // Log ONE grouped activity event
  if (results.length > 0) {
    after(async () => {
      try {
        const svc = createServiceClient();
        const actor = actorName(currentUser);

        const { data: applicantRows } = await svc
          .from("applicants")
          .select("id, full_name")
          .in("id", results.map(r => r.applicantId));
        const nameMap = new Map(applicantRows?.map(a => [a.id, a.full_name]) ?? []);

        const changes = results.map(r => ({
          applicant_id: r.applicantId,
          applicant_name: nameMap.get(r.applicantId) ?? "Unknown",
          old_value: r.oldValue,
        }));

        const newValue = columnType === "number" ? value
          : columnType === "date" ? value
          : columnType === "checkbox" ? Boolean(value)
          : (value !== null && value !== undefined ? String(value).trim() || null : null);

        const summary = results.length === 1
          ? `${actor} changed ${changes[0].applicant_name}'s ${column.name}`
          : `${actor} updated ${column.name} for ${results.length} applicants`;

        await logActivityEvent(svc, {
          companyId,
          jobId,
          actorUserId: currentUser?.id ?? null,
          actorType: "user",
          eventType: "cells.bulk_updated",
          entityType: "applicant",
          entityId: null,
          summary,
          data: {
            actor_name: actor,
            column_id: columnId,
            column_name: column.name,
            column_type: columnType,
            new_value: newValue,
            changes,
          },
        });
      } catch (err) {
        console.error('[bulkUpdateTextCells] Failed to log activity:', err);
      }
    });
  }

  return { successful: results.length, failed: errors.length, errors };
}

// ===== Revert Cell Change =====

/**
 * Reverts a cell.updated or cells.bulk_updated activity event back to old values.
 * Called from the Activity Log drawer's Undo button.
 */
export async function revertCellChange(
  companyId: string,
  jobId: string,
  activityEventId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  if (!currentUser) return { ok: false, error: "Not authenticated" };

  // Fetch the activity event using service role (bypasses RLS on activity_events)
  const svc = createServiceClient();
  const { data: event, error: fetchError } = await svc
    .from("activity_events")
    .select("*")
    .eq("id", activityEventId)
    .eq("company_id", companyId)  // security: ensure company matches
    .eq("job_id", jobId)
    .single();

  if (fetchError || !event) {
    return { ok: false, error: "Activity event not found" };
  }

  if (event.event_type !== "cell.updated" && event.event_type !== "cells.bulk_updated") {
    return { ok: false, error: "This event type cannot be reverted" };
  }

  const { column_id: columnId, column_type: columnType } = event.data;

  function buildRevertCellData(applicantId: string, oldValue: any) {
    const base: any = {
      applicant_id: applicantId,
      column_id: columnId,
      value_text: null,
      value_number: null,
      value_date: null,
      value_bool: null,
      value_status_label_id: null,
    };
    if (columnType === "status") base.value_status_label_id = oldValue;
    else if (columnType === "number") base.value_number = oldValue;
    else if (columnType === "date") base.value_date = oldValue;
    else if (columnType === "checkbox") base.value_bool = oldValue;
    else base.value_text = oldValue;
    return base;
  }

  const actor = actorName(currentUser);

  if (event.event_type === "cell.updated") {
    const { applicant_id: applicantId, old_value: oldValue, applicant_name: applicantName, column_name: columnName } = event.data;

    const { error: upsertError } = await svc
      .from("board_cells")
      .upsert(buildRevertCellData(applicantId, oldValue), { onConflict: "applicant_id,column_id" });

    if (upsertError) return { ok: false, error: upsertError.message };

    // Sync full_name if this was a name column
    if (columnType === "text") {
      const cn = (columnName ?? "").toLowerCase().trim();
      if (cn === "first name" || cn === "firstname" || cn === "last name" || cn === "lastname") {
        const { data: nameCells } = await svc
          .from("board_cells")
          .select("value_text, board_columns!inner(name)")
          .eq("applicant_id", applicantId);
        let firstName = "", lastName = "";
        for (const cell of nameCells ?? []) {
          const ccn = (cell as any).board_columns?.name?.toLowerCase().trim() ?? "";
          if (ccn === "first name" || ccn === "firstname") firstName = (cell as any).value_text ?? "";
          else if (ccn === "last name" || ccn === "lastname") lastName = (cell as any).value_text ?? "";
        }
        const fullName = [firstName, lastName].filter(Boolean).join(" ");
        if (fullName) await svc.from("applicants").update({ full_name: fullName }).eq("id", applicantId);
      }
    }

    await logActivityEvent(svc, {
      companyId, jobId, actorUserId: currentUser.id, actorType: "user",
      eventType: "cell.reverted", entityType: "applicant", entityId: applicantId,
      summary: `${actor} reverted ${applicantName ?? "an applicant"}'s ${columnName}`,
      data: { actor_name: actor, reverted_event_id: activityEventId, column_name: columnName, column_type: columnType },
    });

  } else {
    // cells.bulk_updated — revert each change in the changes array
    const { changes, column_name: columnName } = event.data as {
      changes: { applicant_id: string; applicant_name: string; old_value: any }[];
      column_name: string;
    };

    const upserts = changes.map(c => buildRevertCellData(c.applicant_id, c.old_value));
    const { error: upsertError } = await svc
      .from("board_cells")
      .upsert(upserts, { onConflict: "applicant_id,column_id" });

    if (upsertError) return { ok: false, error: upsertError.message };

    await logActivityEvent(svc, {
      companyId, jobId, actorUserId: currentUser.id, actorType: "user",
      eventType: "cells.bulk_reverted", entityType: "applicant", entityId: null,
      summary: `${actor} reverted ${columnName} for ${changes.length} applicant${changes.length !== 1 ? "s" : ""}`,
      data: { actor_name: actor, reverted_event_id: activityEventId, column_name: columnName, column_type: columnType, count: changes.length },
    });
  }

  return { ok: true };
}

// ===== Row (Applicant) Actions =====

export async function moveApplicant(
  companyId: string,
  jobId: string,
  applicantId: string,
  groupId: string
) {
  const supabase = await createClient();

  // Determine the next position in the target group so the applicant lands at the bottom
  const { data: tail } = await supabase
    .from("applicants")
    .select("position")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .eq("group_id", groupId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition = (tail?.[0]?.position ?? -1) + 1;

  // UPDATE — RLS enforces auth, no pre-flight SELECTs needed
  const { error, count } = await supabase
    .from("applicants")
    .update({ group_id: groupId, position: nextPosition }, { count: 'exact' })
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) {
    console.error("[moveApplicant] Supabase Error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(`Move failed: ${error.message}`);
  }

  if (count === 0) {
    console.error("[moveApplicant] No rows updated — RLS blocked or applicant missing", {
      filters: { id: applicantId, company_id: companyId, job_id: jobId },
      targetGroupId: groupId,
    });
    throw new Error("Failed to move applicant. You may not have update permissions.");
  }

  // Pre-capture user before after() — cookie context is unavailable post-response
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  // Log activity asynchronously — doesn't block the response
  after(async () => {
    try {
      const svc = createServiceClient();
      const actor = actorName(currentUser);
      const [{ data: applicantRow }, { data: grp }] = await Promise.all([
        svc.from("applicants").select("full_name").eq("id", applicantId).maybeSingle(),
        svc.from("board_groups").select("name").eq("id", groupId).maybeSingle(),
      ]);
      await logActivityEvent(svc, {
        companyId,
        jobId,
        actorUserId: currentUser?.id ?? null,
        actorType: "user",
        eventType: "applicant.moved_group",
        entityType: "applicant",
        entityId: applicantId,
        summary: `${actor} moved ${applicantRow?.full_name ?? "applicant"} to ${grp?.name ?? "a group"}`,
        data: { actor_name: actor, applicant_name: applicantRow?.full_name, group_name: grp?.name },
      });
    } catch {}
  });

  // NOTE: revalidatePath intentionally omitted — the board optimistically updates
  // group_id via setLocalApplicants before this action runs, matching the pattern
  // used by updateBoardCell / cellOverrides.
}

export async function deleteApplicant(
  companyId: string,
  jobId: string,
  applicantId: string
) {
  const supabase = await createClient();

  // Get current user info for debugging
  const { data: { user } } = await supabase.auth.getUser();

  if (VERBOSE) console.log('[deleteApplicant] Called with:', {
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

  if (VERBOSE) console.log('[deleteApplicant] Pre-delete check:', {
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

  if (VERBOSE) console.log('[deleteApplicant] Permission check:', {
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

  if (VERBOSE) console.log('[deleteApplicant] Delete result:', {
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

  if (VERBOSE) console.log('[deleteApplicant] Successfully deleted applicant:', existingApplicant.full_name);

  // Log activity
  try {
    const actor = actorName(user);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user?.id ?? null,
      actorType: "user",
      eventType: "applicant.deleted",
      entityType: "applicant",
      entityId: applicantId,
      summary: `${actor} deleted ${existingApplicant.full_name}`,
      data: { actor_name: actor, applicant_name: existingApplicant.full_name },
    });
  } catch {}

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

  // Get current user info for debugging
  const { data: { user } } = await supabase.auth.getUser();

  if (VERBOSE) console.log('[reorderApplicants] Called with:', {
    userId: user?.id,
    userEmail: user?.email,
    companyId,
    jobId,
    applicantId,
    newPosition,
    groupId,
  });

  // First, check if the applicant exists
  const { data: existingApplicant, error: checkError } = await supabase
    .from("applicants")
    .select("id, full_name, position, group_id")
    .eq("id", applicantId)
    .maybeSingle();

  if (VERBOSE) console.log('[reorderApplicants] Pre-reorder check:', {
    found: !!existingApplicant,
    applicant: existingApplicant,
    checkError: checkError?.message,
  });

  if (checkError) {
    console.error('[reorderApplicants] Pre-reorder check failed:', checkError);
  }

  if (!existingApplicant) {
    console.error('[reorderApplicants] Applicant not found or no SELECT permission');
    throw new Error('Applicant not found or you do not have permission to view it.');
  }

  // Attempt reorder with row count
  const { error, count } = await supabase
    .from("applicants")
    .update({ position: newPosition, group_id: groupId }, { count: 'exact' })
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) {
    console.error("[reorderApplicants] Supabase Error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(`Reorder failed: ${error.message}`);
  }

  if (VERBOSE) console.log('[reorderApplicants] Reorder result:', {
    updatedCount: count,
    success: count === 1,
    oldPosition: existingApplicant.position,
    newPosition,
    oldGroup: existingApplicant.group_id,
    newGroup: groupId,
  });

  if (count === 0) {
    console.error('[reorderApplicants] CRITICAL: No rows updated despite SELECT permission!', {
      applicantExists: !!existingApplicant,
      filters: { id: applicantId, company_id: companyId, job_id: jobId },
      possibleCauses: [
        'RLS UPDATE policy blocking (user not company member - check migration 00027)',
        'company_id or job_id mismatch',
        'Applicant deleted by concurrent request',
      ],
    });
    throw new Error('Failed to reorder applicant. You may not have update permissions.');
  }

  if (VERBOSE) console.log('[reorderApplicants] ✓ Successfully reordered applicant:', {
    name: existingApplicant.full_name,
    position: `${existingApplicant.position} → ${newPosition}`,
    group: groupId || '(no group)',
  });

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

/** Save board-wide default column values. Each column's default is stored in
 *  board_columns.settings.default_value, merged with existing settings. */
export async function setBoardDefaultValues(
  companyId: string,
  jobId: string,
  updates: { columnId: string; defaultValue: any }[]
) {
  const supabase = await createClient();

  await Promise.all(
    updates.map(async ({ columnId, defaultValue }) => {
      // Fetch current settings so we can merge (not replace)
      const { data: col } = await supabase
        .from("board_columns")
        .select("settings")
        .eq("id", columnId)
        .eq("company_id", companyId)
        .single();

      const merged = {
        ...(col?.settings ?? {}),
        default_value: defaultValue ?? null,
      };

      await supabase
        .from("board_columns")
        .update({ settings: merged })
        .eq("id", columnId)
        .eq("company_id", companyId);
    })
  );

  revalidatePath(dashPath(companyId, jobId));
}

/** Maps a column type + default_value to the correct board_cells fields. */
function buildDefaultCell(
  applicantId: string,
  columnId: string,
  columnType: string,
  defaultValue: any
): Record<string, any> | null {
  const base = { applicant_id: applicantId, column_id: columnId };
  switch (columnType) {
    case "status":
      return { ...base, value_status_label_id: defaultValue };
    case "text":
    case "email":
    case "phone":
      return { ...base, value_text: String(defaultValue) };
    case "number":
      return { ...base, value_number: Number(defaultValue) };
    case "date":
      return { ...base, value_date: String(defaultValue) };
    case "checkbox":
      return { ...base, value_bool: Boolean(defaultValue) };
    case "fadv.package":
    case "fadv.location":
    case "fadv.facility_id":
    case "fadv.position_type":
      return { ...base, value_text: String(defaultValue) };
    default:
      return null;
  }
}

/**
 * Quick create applicant with minimal data directly in a group.
 * Monday.com-style inline item creation.
 * Applies board-wide default column values if configured.
 */
export async function quickCreateApplicant(
  companyId: string,
  jobId: string,
  groupId: string,
  boardId: string
): Promise<{
  applicant: any;
  defaultCells: { columnId: string; columnType: string; value: any }[];
} | null> {
  const supabase = await createClient();

  // Get highest position in group
  const { data: existingRows } = await supabase
    .from("applicants")
    .select("position")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .eq("group_id", groupId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (existingRows?.[0]?.position ?? -1) + 1;

  // Create minimal applicant
  const { data: newApplicant, error } = await supabase
    .from("applicants")
    .insert({
      company_id: companyId,
      job_id: jobId,
      board_id: boardId,
      group_id: groupId,
      full_name: "New Applicant",
      email: null,
      phone: null,
      status: "applied", // Must match check constraint: applied|reviewing|interviewing|offer|hired|rejected
      position: nextPosition,
    })
    .select()
    .single();

  if (error) {
    console.error("[quickCreateApplicant] Error:", error);
    throw new Error(error.message);
  }

  if (VERBOSE) console.log("[quickCreateApplicant] Created:", newApplicant);

  // Apply board-wide default column values
  const defaultCells: { columnId: string; columnType: string; value: any }[] = [];
  try {
    const { data: cols } = await supabase
      .from("board_columns")
      .select("id, type, settings")
      .eq("board_id", boardId)
      .eq("company_id", companyId);

    const cellsToInsert: Record<string, any>[] = [];
    for (const col of cols ?? []) {
      const dv = col.settings?.default_value;
      if (dv == null) continue;
      const cell = buildDefaultCell(newApplicant.id, col.id, col.type, dv);
      if (cell) {
        cellsToInsert.push(cell);
        defaultCells.push({ columnId: col.id, columnType: col.type, value: dv });
      }
    }

    if (cellsToInsert.length > 0) {
      await supabase
        .from("board_cells")
        .upsert(cellsToInsert, { onConflict: "applicant_id,column_id" });
    }
  } catch (err) {
    console.error("[quickCreateApplicant] Failed to apply defaults:", err);
    // Non-fatal — applicant was still created
  }

  // Pre-capture user before after() — cookie context is unavailable post-response
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const applicantId = newApplicant.id;

  // Log activity asynchronously — doesn't block the response
  after(async () => {
    try {
      const svc = createServiceClient();
      const actor = actorName(currentUser);
      const { data: grp } = await svc
        .from("board_groups")
        .select("name")
        .eq("id", groupId)
        .maybeSingle();
      await logActivityEvent(svc, {
        companyId,
        jobId,
        actorUserId: currentUser?.id ?? null,
        actorType: "user",
        eventType: "applicant.created",
        entityType: "applicant",
        entityId: applicantId,
        summary: `${actor} added New Applicant to ${grp?.name ?? "a group"}`,
        data: { actor_name: actor, group_name: grp?.name ?? null },
      });
    } catch {}
  });

  // NOTE: revalidatePath intentionally omitted — the new applicant is returned
  // to the caller and appended to localApplicants state client-side, matching
  // the optimistic pattern used by updateBoardCell / cellOverrides.
  return { applicant: newApplicant, defaultCells };
}

// ── sendToFadv ────────────────────────────────────────────────────────────────

/**
 * Submit an applicant to First Advantage (FADV) for background screening.
 * Validates company-level config (CSP ID, Company ID) and applicant-level
 * fields (package, location, facility_id, position_type) before submitting.
 */
export async function sendToFadv(
  companyId: string,
  jobId: string,
  applicantId: string
): Promise<{ success: boolean; error?: string; subjectId?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { submitToFadv } = await import("@/lib/fadv/submit");
    const result = await submitToFadv(supabase, {
      companyId,
      jobId,
      applicantId,
      actorUserId: user.id,
    });

    if (result.success) {
      revalidatePath(dashPath(companyId, jobId));
    }

    return result;
  } catch (err: any) {
    console.error("[sendToFadv] Error:", err);
    return { success: false, error: err.message ?? "Unknown error" };
  }
}

// ── setApplicantIntegrationField ──────────────────────────────────────────────

/**
 * Directly set a FADV applicant field in applicant_integration_fields.
 * Used by the integration.set_field automation action.
 */
export async function setApplicantIntegrationField(
  companyId: string,
  jobId: string,
  applicantId: string,
  provider: string,
  fieldKey: string,
  value: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Fetch existing to merge
    const { data: existing } = await supabase
      .from("applicant_integration_fields")
      .select("fields")
      .eq("applicant_id", applicantId)
      .eq("provider", provider)
      .maybeSingle();

    const existingFields = (existing?.fields ?? {}) as Record<string, string | null>;
    const updatedFields = { ...existingFields, [fieldKey]: value };

    const { error } = await supabase
      .from("applicant_integration_fields")
      .upsert(
        {
          applicant_id: applicantId,
          company_id: companyId,
          job_id: jobId,
          provider,
          fields: updatedFields,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "applicant_id,provider" }
      );

    if (error) {
      console.error("[setApplicantIntegrationField] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[setApplicantIntegrationField] Error:", err);
    return { success: false, error: err.message ?? "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// Archive / Restore
// ---------------------------------------------------------------------------

export async function archiveApplicants(
  companyId: string,
  jobId: string,
  applicantIds: string[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error, count } = await supabase
    .from("applicants")
    .update({ archived_at: new Date().toISOString(), archived_by: user?.id ?? null }, { count: "exact" })
    .in("id", applicantIds)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(`Archive failed: ${error.message}`);
  if (count === 0) throw new Error("Failed to archive applicants. You may not have permissions.");

  const n = count ?? applicantIds.length;
  const actor = actorName(user);

  after(async () => {
    try {
      await logActivityEvent(supabase, {
        companyId,
        jobId,
        actorUserId: user?.id ?? null,
        actorType: "user",
        eventType: "applicant.archived",
        entityType: "applicant",
        summary: `${actor} archived ${n} applicant${n !== 1 ? "s" : ""}`,
        data: { actor_name: actor, count: n, applicant_ids: applicantIds },
      });
    } catch {}
  });

  revalidatePath(dashPath(companyId, jobId));
}

export async function restoreApplicants(
  companyId: string,
  jobId: string,
  applicantIds: string[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error, count } = await supabase
    .from("applicants")
    .update({ archived_at: null, archived_by: null }, { count: "exact" })
    .in("id", applicantIds)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  if (error) throw new Error(`Restore failed: ${error.message}`);
  if (count === 0) throw new Error("Failed to restore applicants. You may not have permissions.");

  const n = count ?? applicantIds.length;
  const actor = actorName(user);

  after(async () => {
    try {
      await logActivityEvent(supabase, {
        companyId,
        jobId,
        actorUserId: user?.id ?? null,
        actorType: "user",
        eventType: "applicant.restored",
        entityType: "applicant",
        summary: `${actor} restored ${n} applicant${n !== 1 ? "s" : ""}`,
        data: { actor_name: actor, count: n, applicant_ids: applicantIds },
      });
    } catch {}
  });

  revalidatePath(dashPath(companyId, jobId));
}

export async function bulkSendEmail(
  companyId: string,
  jobId: string,
  applicantIds: string[],
  subject: string,
  body: string
): Promise<{ sent: number; failed: number; noEmail: number }> {
  const supabase = await createClient();

  // Get Gmail client for company
  const gmailClient = await getGmailClientForCompany(supabase, companyId);
  if (!gmailClient) {
    throw new Error("No Gmail connection found for this company. Connect Gmail in Settings first.");
  }

  // Fetch applicant details (name + email) for all selected IDs
  const { data: applicants, error } = await supabase
    .from("applicants")
    .select("id, full_name, email")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .in("id", applicantIds);

  if (error) throw new Error(`Failed to fetch applicants: ${error.message}`);

  // Fetch email-type board columns so we can fall back to board cell values
  const { data: emailColumns } = await supabase
    .from("board_columns")
    .select("id")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .eq("type", "email");

  const emailColumnIds = (emailColumns ?? []).map((c) => c.id);

  // Fetch board cells for email columns for these applicants
  const emailCellMap = new Map<string, string>(); // applicant_id → email
  if (emailColumnIds.length > 0) {
    const { data: emailCells } = await supabase
      .from("board_cells")
      .select("applicant_id, value_text")
      .in("applicant_id", applicantIds)
      .in("column_id", emailColumnIds)
      .not("value_text", "is", null);

    for (const cell of emailCells ?? []) {
      if (cell.value_text?.trim() && !emailCellMap.has(cell.applicant_id)) {
        emailCellMap.set(cell.applicant_id, cell.value_text.trim());
      }
    }
  }

  // Fetch company name for template variables
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .single();

  // Fetch job title for template variables
  const { data: job } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", jobId)
    .single();

  let sent = 0;
  let failed = 0;
  let noEmail = 0;

  for (const applicant of applicants ?? []) {
    // Prefer applicants.email, fall back to board cell value
    const emailAddress = applicant.email?.trim() || emailCellMap.get(applicant.id) || "";

    if (!emailAddress) {
      noEmail++;
      continue;
    }

    const nameParts = (applicant.full_name ?? "").trim().split(/\s+/);
    const context: Record<string, string> = {
      applicant_name: applicant.full_name ?? "",
      first_name: nameParts[0] ?? "",
      last_name: nameParts.slice(1).join(" "),
      applicant_email: emailAddress,
      company_name: company?.name ?? "",
      job_title: job?.title ?? "",
    };

    const resolvedSubject = resolveVariables(subject, context);
    const resolvedBody = plainTextToHtml(resolveVariables(body, context));

    const result = await sendEmail(gmailClient.gmail, {
      to: emailAddress,
      subject: resolvedSubject,
      body: resolvedBody,
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed, noEmail };
}

export async function getArchivedApplicants(companyId: string, jobId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applicants")
    .select("id, full_name, email, group_id, archived_at, archived_by")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch archived applicants: ${error.message}`);

  // Fetch archiver display names
  if (data && data.length > 0) {
    const archiverIds = [...new Set(data.map((a) => a.archived_by).filter(Boolean))] as string[];
    if (archiverIds.length > 0) {
      const svc = createServiceClient();
      const { data: profiles } = await svc
        .from("profiles")
        .select("id, display_name")
        .in("id", archiverIds);

      const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
      return data.map((a) => ({
        ...a,
        archived_by_name: a.archived_by ? nameMap.get(a.archived_by) ?? "Unknown" : "Unknown",
      }));
    }
  }

  return (data ?? []).map((a) => ({ ...a, archived_by_name: "Unknown" }));
}


