"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Renames the Applicants board for a company
 */
export async function renameApplicantsBoard(
  companyId: string,
  newName: string
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check user has access
  const { data: company } = await supabase
    .from("companies")
    .select("account_id")
    .eq("id", companyId)
    .single();

  if (!company) {
    return { error: "Company not found" };
  }

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role === "viewer") {
    return { error: "Permission denied" };
  }

  // Find the Applicants board
  const { data: board } = await supabase
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .or('name.eq.Applicants,name.ilike.%Applicants%')
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!board) {
    return { error: "Applicants board not found" };
  }

  // Rename the board
  const { error } = await supabase
    .from("boards")
    .update({ name: newName })
    .eq("id", board.id);

  if (error) {
    console.error("Error renaming board:", error);
    return { error: "Failed to rename board" };
  }

  revalidatePath(`/dashboard/${companyId}`);
  return { success: true };
}

/**
 * Duplicates the Applicants board configuration (groups + columns, not applicants)
 */
export async function duplicateApplicantsBoard(companyId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check user has access
  const { data: company } = await supabase
    .from("companies")
    .select("account_id")
    .eq("id", companyId)
    .single();

  if (!company) {
    return { error: "Company not found" };
  }

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role === "viewer") {
    return { error: "Permission denied" };
  }

  // Find the Applicants board
  const { data: sourceBoard } = await supabase
    .from("boards")
    .select("id, name")
    .eq("company_id", companyId)
    .or('name.eq.Applicants,name.ilike.%Applicants%')
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!sourceBoard) {
    return { error: "Applicants board not found" };
  }

  // Create duplicate board
  const { data: newBoard, error: boardError } = await supabase
    .from("boards")
    .insert({
      company_id: companyId,
      name: `${sourceBoard.name} (Copy)`,
    })
    .select()
    .single();

  if (boardError || !newBoard) {
    console.error("Error creating duplicate board:", boardError);
    return { error: "Failed to duplicate board" };
  }

  // Duplicate groups
  const { data: sourceGroups } = await supabase
    .from("board_groups")
    .select("*")
    .eq("board_id", sourceBoard.id);

  if (sourceGroups && sourceGroups.length > 0) {
    const newGroups = sourceGroups.map((group) => ({
      board_id: newBoard.id,
      company_id: companyId,
      name: group.name,
      color: group.color,
      sort_order: group.sort_order,
      is_collapsed: group.is_collapsed,
    }));

    await supabase.from("board_groups").insert(newGroups);
  }

  // Duplicate columns
  const { data: sourceColumns } = await supabase
    .from("board_columns")
    .select("*")
    .eq("board_id", sourceBoard.id);

  if (sourceColumns && sourceColumns.length > 0) {
    const newColumns = sourceColumns.map((col) => ({
      board_id: newBoard.id,
      company_id: companyId,
      name: col.name,
      type: col.type,
      sort_order: col.sort_order,
      is_system: col.is_system,
      settings: col.settings,
    }));

    const { data: insertedColumns } = await supabase
      .from("board_columns")
      .insert(newColumns)
      .select();

    // Duplicate status labels for status columns
    if (insertedColumns) {
      for (let i = 0; i < sourceColumns.length; i++) {
        const sourceCol = sourceColumns[i];
        const newCol = insertedColumns[i];

        if (sourceCol.type === "status") {
          const { data: labels } = await supabase
            .from("board_status_labels")
            .select("*")
            .eq("column_id", sourceCol.id);

          if (labels && labels.length > 0) {
            const newLabels = labels.map((label) => ({
              column_id: newCol.id,
              label: label.label,
              color: label.color,
              sort_order: label.sort_order,
            }));

            await supabase.from("board_status_labels").insert(newLabels);
          }
        }
      }
    }
  }

  revalidatePath(`/dashboard/${companyId}`);
  return { success: true, boardId: newBoard.id };
}

/**
 * Deletes the Applicants board (with confirmation)
 */
export async function deleteApplicantsBoard(companyId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check user has access
  const { data: company } = await supabase
    .from("companies")
    .select("account_id")
    .eq("id", companyId)
    .single();

  if (!company) {
    return { error: "Company not found" };
  }

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role === "viewer") {
    return { error: "Permission denied" };
  }

  // Find the Applicants board
  const { data: board } = await supabase
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .or('name.eq.Applicants,name.ilike.%Applicants%')
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!board) {
    return { error: "Applicants board not found" };
  }

  // Delete the board (cascades to columns, cells, etc.)
  const { error } = await supabase
    .from("boards")
    .delete()
    .eq("id", board.id);

  if (error) {
    console.error("Error deleting board:", error);
    return { error: "Failed to delete board" };
  }

  revalidatePath(`/dashboard/${companyId}`);
  return { success: true };
}
