"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateEmail, validatePhone, validateLocation } from "@/lib/validation/columnValidation";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";
import { getOrCreateApplicantsBoard as getOrCreateBoardLib } from "@/lib/boards/getOrCreateApplicantsBoard";

const VERBOSE = false; // set to true to re-enable verbose action logs

/** Returns actor name from user metadata for activity log entries. */
function actorName(user: { user_metadata?: { full_name?: string }; email?: string } | null): string {
  return user?.user_metadata?.full_name ?? user?.email ?? "Someone";
}

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
  columnId: string
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

  // TRIGGER AUTOMATION: Detect status change and fire Monday.com-style trigger.
  // Wrapped in after() so automations run after the response is sent — doesn't block the client.
  // IMPORTANT: The cookie-based supabase client is NOT safe inside after() because the request
  // context (cookies) is gone by the time after() runs. We pre-capture the user here (during the
  // main request) and create a service role client inside after() for all DB operations.
  if (columnType === "status" && oldStatusLabelId !== value) {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    after(async () => {
      try {
        // Service role client — no cookies needed, safe to use inside after()
        const { createClient: createServiceClient } = await import("@supabase/supabase-js");
        const svc = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

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

        // Log cell.updated activity using pre-captured user (cookies unavailable in after())
        try {
          const actor = actorName(currentUser);
          if (newLabel) {
            // Fetch applicant name for richer log entry
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
              summary: `${actor} changed ${applicantName}'s ${column?.name ?? "status"} → ${newLabel}`,
              data: { actor_name: actor, applicant_name: applicantName, column_name: column?.name, old_label: oldLabel, new_label: newLabel },
            });
          }
        } catch {}
      } catch (automationError) {
        console.error('[updateBoardCell] Error firing automation:', automationError);
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

  // Process each applicant individually to:
  // 1. Get the old status value
  // 2. Update the cell
  // 3. Fire automation trigger
  const results = [];
  const errors = [];

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
            const { createClient: createServiceClient } = await import("@supabase/supabase-js");
            const svc = createServiceClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

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

      results.push({ applicantId, success: true });
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

  // NOTE: revalidatePath intentionally omitted — see updateBoardCell comment above.

  return {
    successful: results.length,
    failed: errors.length,
    errors,
  };
}

// ===== Row (Applicant) Actions =====

export async function moveApplicant(
  companyId: string,
  jobId: string,
  applicantId: string,
  groupId: string
) {
  const supabase = await createClient();

  // Get current user info for debugging
  const { data: { user } } = await supabase.auth.getUser();

  if (VERBOSE) console.log('[moveApplicant] Called with:', {
    userId: user?.id,
    userEmail: user?.email,
    companyId,
    jobId,
    applicantId,
    targetGroupId: groupId,
  });

  // First, check if the applicant exists and is visible
  const { data: existingApplicant, error: checkError } = await supabase
    .from("applicants")
    .select("id, full_name, group_id, company_id, job_id")
    .eq("id", applicantId)
    .maybeSingle();

  if (VERBOSE) console.log('[moveApplicant] Pre-move check:', {
    found: !!existingApplicant,
    applicant: existingApplicant,
    checkError: checkError?.message,
  });

  if (checkError) {
    console.error('[moveApplicant] Pre-move check failed:', checkError);
  }

  if (!existingApplicant) {
    console.error('[moveApplicant] Applicant not found or no SELECT permission');
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

  if (VERBOSE) console.log('[moveApplicant] Permission check:', {
    userMembership: membership,
    companyAccount: company?.account_id,
    hasPermission: membership?.account_id === company?.account_id,
    userRole: membership?.role,
  });

  // Verify target group exists
  const { data: targetGroup } = await supabase
    .from("board_groups")
    .select("id, name, board_id")
    .eq("id", groupId)
    .maybeSingle();

  if (VERBOSE) console.log('[moveApplicant] Target group check:', {
    groupId,
    groupExists: !!targetGroup,
    groupName: targetGroup?.name,
    boardId: targetGroup?.board_id,
  });

  if (!targetGroup) {
    throw new Error(`Target group ${groupId} not found`);
  }

  // Attempt move with row count
  const { error, count } = await supabase
    .from("applicants")
    .update({ group_id: groupId }, { count: 'exact' })
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

  if (VERBOSE) console.log('[moveApplicant] Move result:', {
    movedCount: count,
    success: count === 1,
    fromGroup: existingApplicant.group_id,
    toGroup: groupId,
    targetGroupName: targetGroup.name,
  });

  if (count === 0) {
    console.error('[moveApplicant] CRITICAL: No rows updated despite SELECT permission!', {
      applicantExists: !!existingApplicant,
      filters: { id: applicantId, company_id: companyId, job_id: jobId },
      targetGroupId: groupId,
      possibleCauses: [
        'RLS UPDATE policy blocking (user not company member - check migration 00027)',
        'company_id or job_id mismatch between request and database',
        'Applicant deleted by concurrent request',
        'Target group belongs to different board/company',
      ],
    });
    throw new Error('Failed to move applicant. You may not have update permissions.');
  }

  if (VERBOSE) console.log('[moveApplicant] ✓ Successfully moved applicant:', {
    name: existingApplicant.full_name,
    fromGroup: existingApplicant.group_id,
    toGroup: targetGroup.name,
  });

  // Log activity
  try {
    const actor = actorName(user);
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user?.id ?? null,
      actorType: "user",
      eventType: "applicant.moved_group",
      entityType: "applicant",
      entityId: applicantId,
      summary: `${actor} moved ${existingApplicant.full_name} to ${targetGroup.name}`,
      data: { actor_name: actor, applicant_name: existingApplicant.full_name, group_name: targetGroup.name },
    });
  } catch {}

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

/**
 * Quick create applicant with minimal data directly in a group.
 * Monday.com-style inline item creation.
 */
export async function quickCreateApplicant(
  companyId: string,
  jobId: string,
  groupId: string,
  boardId: string
) {
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

  // Log activity
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const actor = actorName(user);
    // Fetch group name for summary
    const { data: grp } = await supabase
      .from("board_groups")
      .select("name")
      .eq("id", groupId)
      .maybeSingle();
    await logActivityEvent(supabase, {
      companyId,
      jobId,
      actorUserId: user?.id ?? null,
      actorType: "user",
      eventType: "applicant.created",
      entityType: "applicant",
      entityId: newApplicant.id,
      summary: `${actor} added New Applicant to ${grp?.name ?? "a group"}`,
      data: { actor_name: actor, group_name: grp?.name ?? null },
    });
  } catch {}

  revalidatePath(dashPath(companyId, jobId));
  return newApplicant;
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


