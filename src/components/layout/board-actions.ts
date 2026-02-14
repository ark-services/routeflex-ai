"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getApplicantsBoard(
  supabase: any,
  companyId: string,
  jobId?: string,
  boardId?: string
): Promise<{ id: string; name?: string } | null> {
  // If the caller already knows the board, use it.
  if (boardId) {
    const { data } = await supabase
      .from("boards")
      .select("id, name")
      .eq("id", boardId)
      .eq("company_id", companyId)
      .single();
    return data ?? null;
  }

  // Prefer job-scoped Applicants boards when jobId is provided.
  // Fall back to legacy company-scoped Applicants board.
  const base = supabase
    .from("boards")
    .select("id, name")
    .eq("company_id", companyId)
    .or('name.eq.Applicants,name.ilike.%Applicants%')
    .order("created_at", { ascending: true })
    .limit(1);

  if (jobId) {
    // Try job-scoped query first.
    const resJob = await base.eq("job_id", jobId);

    // If job_id column doesn't exist (older schema), resJob.error will mention it.
    if (!resJob.error && resJob.data && Array.isArray(resJob.data) && resJob.data.length > 0) {
      return resJob.data[0];
    }

    if (
      resJob.error &&
      typeof resJob.error.message === "string" &&
      resJob.error.message.toLowerCase().includes('column "job_id"')
    ) {
      // legacy schema: ignore and fall through
    } else if (resJob.error) {
      console.error("getApplicantsBoard job-scoped error:", resJob.error);
    }
  }

  // Legacy: company-scoped Applicants board
  const resLegacy = await base;
  if (!resLegacy.error && resLegacy.data && Array.isArray(resLegacy.data) && resLegacy.data.length > 0) {
    return resLegacy.data[0];
  }

  if (resLegacy.error) {
    console.error("getApplicantsBoard legacy error:", resLegacy.error);
  }

  return null;
}

/**
 * Renames the Applicants board for a company
 */
export async function renameApplicantsBoard(
  companyId: string,
  newName: string,
  jobId?: string,
  boardId?: string
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

  const board = await getApplicantsBoard(supabase, companyId, jobId, boardId);

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
  if (jobId) {
    revalidatePath(`/dashboard/${companyId}/jobs/${jobId}`);
    revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  }
  return { success: true };
}

/**
 * Duplicates the Applicants board configuration (groups + columns, not applicants)
 */
export async function duplicateApplicantsBoard(companyId: string, jobId?: string, boardId?: string) {
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

  const sourceBoard = await getApplicantsBoard(supabase, companyId, jobId, boardId);

  if (!sourceBoard) {
    return { error: "Applicants board not found" };
  }

  const insertWithJob = {
    company_id: companyId,
    job_id: jobId,
    name: `${sourceBoard.name ?? "Applicants"} (Copy)`,
  };

  const insertLegacy = {
    company_id: companyId,
    name: `${sourceBoard.name ?? "Applicants"} (Copy)`,
  };

  let newBoard: any = null;
  {
    const res1 = await supabase.from("boards").insert(insertWithJob as any).select().single();
    if (
      res1.error &&
      typeof res1.error.message === "string" &&
      res1.error.message.toLowerCase().includes('column "job_id"')
    ) {
      const res2 = await supabase.from("boards").insert(insertLegacy).select().single();
      if (res2.error || !res2.data) {
        console.error("Error creating duplicate board:", res2.error);
        return { error: "Failed to duplicate board" };
      }
      newBoard = res2.data;
    } else if (res1.error || !res1.data) {
      console.error("Error creating duplicate board:", res1.error);
      return { error: "Failed to duplicate board" };
    } else {
      newBoard = res1.data;
    }
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

            const payloadWithIds = newLabels.map((nl) => ({
              ...nl,
              company_id: companyId,
              board_id: newBoard.id,
            }));

            const res1 = await supabase.from("board_status_labels").insert(payloadWithIds as any);
            if (
              res1.error &&
              typeof res1.error.message === "string" &&
              (res1.error.message.includes('column "company_id"') || res1.error.message.includes('column "board_id"'))
            ) {
              const res2 = await supabase.from("board_status_labels").insert(newLabels);
              if (res2.error) {
                console.error("Error duplicating status labels:", res2.error);
              }
            } else if (res1.error) {
              console.error("Error duplicating status labels:", res1.error);
            }
          }
        }
      }
    }
  }

  revalidatePath(`/dashboard/${companyId}`);
  if (jobId) {
    revalidatePath(`/dashboard/${companyId}/jobs/${jobId}`);
    revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  }
  return { success: true, boardId: newBoard.id };
}

/**
 * Deletes the Applicants board (with confirmation)
 */
export async function deleteApplicantsBoard(companyId: string, jobId?: string, boardId?: string) {
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

  const board = await getApplicantsBoard(supabase, companyId, jobId, boardId);

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
  if (jobId) {
    revalidatePath(`/dashboard/${companyId}/jobs/${jobId}`);
    revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  }
  return { success: true };
}
