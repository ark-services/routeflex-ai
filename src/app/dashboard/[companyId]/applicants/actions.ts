"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_APPLICANT_STATUSES = new Set([
  "applied",
  "screening",
  "first_advantage",
  "interviewing",
  "tsa",
  "hr_paperwork",
  "hired",
  "rejected",
]);

/**
 * Normalizes any incoming status string into a DB-allowed value.
 * IMPORTANT: The DB has a CHECK constraint (`applicants_status_check`) so any
 * non-allowed value will hard-fail inserts/updates.
 */
function normalizeApplicantStatus(input: string | null | undefined): string {
  const raw = (input ?? "").toString();
  const s = raw.trim().toLowerCase();

  // Empty/undefined -> default
  if (!s) return "applied";

  // Common UI synonyms / older values -> DB-allowed values
  if (s === "new" || s === "new_applicants" || s === "new applicants" || s === "pending" || s === "open") return "applied";
  if (s === "applied" || s === "application" || s === "application received") return "applied";

  // Interview
  if (s === "interview" || s === "interviewing" || s === "phone screen" || s === "screen" || s === "screening") {
    // Keep "screening" distinct if explicitly provided
    if (s === "screen" || s === "screening" || s === "phone screen") return "screening";
    return "interviewing";
  }

  // Background check / First Advantage
  if (
    s === "background" ||
    s === "background_check" ||
    s === "background check" ||
    s === "bg" ||
    s === "firstadvantage" ||
    s === "first advantage" ||
    s === "first-advantage" ||
    s === "first_advantage"
  ) return "first_advantage";

  // TSA
  if (s === "tsa" || s === "security" || s === "security check") return "tsa";

  // HR paperwork
  if (s === "hr" || s === "paperwork" || s === "hr paperwork" || s === "final paperwork" || s === "final hr paperwork" || s === "hr_paperwork") {
    return "hr_paperwork";
  }

  // Hired / Rejected
  if (s === "hire" || s === "hired" || s === "onboarded" || s === "onboarding") return "hired";
  if (s === "reject" || s === "rejected" || s === "declined" || s === "not moving forward") return "rejected";

  // Already valid?
  if (ALLOWED_APPLICANT_STATUSES.has(s)) return s;

  // Safety fallback to avoid breaking onboarding/job creation due to unexpected strings
  // (DB will reject unknown values anyway; defaulting here keeps flows resilient.)
  console.warn(
    `normalizeApplicantStatus: unexpected status "${raw}". Defaulting to "applied". Allowed: ${Array.from(ALLOWED_APPLICANT_STATUSES).join(", ")}`
  );
  return "applied";
}

function dashPath(companyId: string) {
  return `/dashboard/${companyId}/applicants`;
}

// ===== Board Management =====

/**
 * Gets or creates the canonical "Applicants" board for a company/job.
 * Ensures exactly one Applicants board exists per company.
 */
export async function getOrCreateApplicantsBoard(
  companyId: string,
  jobId?: string
): Promise<string> {
  const supabase = await createClient();

  // Look for existing Applicants board
  const { data: existingBoards } = await supabase
    .from("boards")
    .select("id, name")
    .eq("company_id", companyId)
    .or('name.eq.Applicants,name.ilike.%Applicants%')
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingBoards && existingBoards.length > 0) {
    // Return the first (oldest) Applicants board as the canonical one
    return existingBoards[0].id;
  }

  // No board exists, create one
  const { data: newBoard, error: boardError } = await supabase
    .from("boards")
    .insert({
      company_id: companyId,
      name: "Applicants",
    })
    .select("id")
    .single();

  if (boardError) {
    console.error("Failed to create Applicants board:", boardError);
    throw new Error("Failed to create Applicants board");
  }

  return newBoard.id;
}

// ===== Seed Default Board Columns =====

/**
 * Seeds default system columns for a company's applicant board.
 * Uses the canonical Applicants board from the boards table.
 * Creates: Name, Email, Phone, Status columns + default status labels.
 */
export async function seedDefaultBoardColumns(companyId: string, jobId?: string) {
  const supabase = await createClient();

  // Check if columns already exist
  const { data: existing } = await supabase
    .from("board_columns")
    .select("id")
    .eq("company_id", companyId)
    .limit(1);

  if (existing && existing.length > 0) {
    return; // Already seeded
  }

  // Get or create the canonical Applicants board
  const boardId = await getOrCreateApplicantsBoard(companyId, jobId);

  // Create system columns
  const systemColumns = [
    { name: "Name", type: "text", sort_order: 1 },
    { name: "Email", type: "text", sort_order: 2 },
    { name: "Phone", type: "text", sort_order: 3 },
    { name: "Status", type: "status", sort_order: 4 },
  ];

  const { data: insertedColumns, error: colError } = await supabase
    .from("board_columns")
    .insert(
      systemColumns.map((col) => ({
        board_id: boardId,
        company_id: companyId,
        name: col.name,
        type: col.type,
        sort_order: col.sort_order,
        is_system: true,
        settings: {},
      }))
    )
    .select();

  if (colError) {
    console.error("Failed to seed board columns:", colError);
    return;
  }

  // Find the Status column and seed default labels
  const statusColumn = insertedColumns?.find((c) => c.type === "status");
  if (!statusColumn) return;

  const defaultLabels = [
    { label: "Applied", color: "#3b82f6", sort_order: 1 },
    { label: "Screening", color: "#8b5cf6", sort_order: 2 },
    { label: "First Advantage", color: "#06b6d4", sort_order: 3 },
    { label: "Interviewing", color: "#f59e0b", sort_order: 4 },
    { label: "TSA", color: "#22c55e", sort_order: 5 },
    { label: "HR Paperwork", color: "#14b8a6", sort_order: 6 },
    { label: "Hired", color: "#10b981", sort_order: 7 },
    { label: "Rejected", color: "#ef4444", sort_order: 8 },
  ];

  // Some schemas enforce RLS using company_id/board_id on labels.
  // We'll try including them first, and gracefully fall back if those columns don't exist.
  const payloadWithIds = defaultLabels.map((lbl) => ({
    column_id: statusColumn.id,
    board_id: boardId,
    company_id: companyId,
    label: lbl.label,
    color: lbl.color,
    sort_order: lbl.sort_order,
  }));

  const payloadMinimal = defaultLabels.map((lbl) => ({
    column_id: statusColumn.id,
    label: lbl.label,
    color: lbl.color,
    sort_order: lbl.sort_order,
  }));

  // Attempt 1: with company_id/board_id
  let labelError: any = null;
  {
    const res = await supabase.from("board_status_labels").insert(payloadWithIds as any);
    labelError = res.error;

    // If the schema doesn't have those columns, retry with minimal payload
    if (
      labelError &&
      typeof labelError.message === "string" &&
      (labelError.message.includes('column "company_id"') || labelError.message.includes('column "board_id"'))
    ) {
      const res2 = await supabase.from("board_status_labels").insert(payloadMinimal as any);
      labelError = res2.error;
    }
  }

  if (labelError) {
    console.error(
      "Failed to seed status labels:",
      typeof labelError === "object" ? JSON.stringify(labelError, null, 2) : labelError
    );
  }
}

export async function updateApplicantStatus(companyId: string, applicantId: string, status: string) {
  const normalized = normalizeApplicantStatus(status);
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .update({ status: normalized })
    .eq("id", applicantId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function bulkMoveApplicants(companyId: string, applicantIds: string[], groupId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .update({ group_id: groupId })
    .in("id", applicantIds)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function bulkDeleteApplicants(companyId: string, applicantIds: string[]) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .delete()
    .in("id", applicantIds)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function createGroup(companyId: string, boardId: string, name: string, color?: string) {
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

  if (readErr) throw new Error(readErr.message);

  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;
  const groupColor = color || defaultColors[nextSort % defaultColors.length];

  const { error } = await supabase
    .from("board_groups")
    .insert({ company_id: companyId, board_id: boardId, name, sort_order: nextSort, color: groupColor });

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function toggleGroupCollapse(companyId: string, boardId: string, groupId: string, isCollapsed: boolean) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_groups")
    .update({ is_collapsed: isCollapsed })
    .eq("id", groupId)
    .eq("company_id", companyId)
    .eq("board_id", boardId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function updateGroupColor(companyId: string, boardId: string, groupId: string, color: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_groups")
    .update({ color })
    .eq("id", groupId)
    .eq("company_id", companyId)
    .eq("board_id", boardId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

// ===== Board Column Actions =====

export async function createBoardColumn(
  companyId: string,
  name: string,
  columnType: "text" | "number" | "date" | "file" | "status",
  afterColumnId?: string
) {
  const supabase = await createClient();

  // Get or create the canonical Applicants board
  const boardId = await getOrCreateApplicantsBoard(companyId);

  let targetSortOrder: number;

  if (afterColumnId) {
    // Insert after a specific column
    const { data: afterColumn } = await supabase
      .from("board_columns")
      .select("sort_order")
      .eq("id", afterColumnId)
      .eq("company_id", companyId)
      .single();

    if (afterColumn) {
      targetSortOrder = afterColumn.sort_order + 0.5;
    } else {
      // Fallback to end
      const { data: existing } = await supabase
        .from("board_columns")
        .select("sort_order")
        .eq("company_id", companyId)
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
      .order("sort_order", { ascending: false })
      .limit(1);

    if (readErr) throw new Error(readErr.message);
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

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
  return data;
}

export async function duplicateBoardColumn(companyId: string, columnId: string) {
  const supabase = await createClient();

  // Get or create the canonical Applicants board
  const boardId = await getOrCreateApplicantsBoard(companyId);

  // Get the source column
  const { data: sourceColumn, error: readErr } = await supabase
    .from("board_columns")
    .select("*")
    .eq("id", columnId)
    .eq("company_id", companyId)
    .single();

  if (readErr || !sourceColumn) throw new Error("Column not found");

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

  if (error) throw new Error(error.message);

  // If it's a status column, duplicate the labels
  if (sourceColumn.type === "status" && newColumn) {
    const { data: labels } = await supabase
      .from("board_status_labels")
      .select("*")
      .eq("column_id", columnId);

    if (labels && labels.length > 0) {
      await supabase.from("board_status_labels").insert(
        labels.map((label) => ({
          column_id: newColumn.id,
          label: label.label,
          color: label.color,
          sort_order: label.sort_order,
        }))
      );
    }
  }

  revalidatePath(dashPath(companyId));
  return newColumn;
}

export async function updateBoardColumn(
  companyId: string,
  columnId: string,
  updates: { name?: string; sort_order?: number }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_columns")
    .update(updates)
    .eq("id", columnId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function deleteBoardColumn(companyId: string, columnId: string) {
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

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

// ===== Status Label Actions =====

export async function createStatusLabel(
  companyId: string,
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

  if (readErr) throw new Error(readErr.message);

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

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
  return data;
}

export async function updateStatusLabel(
  companyId: string,
  labelId: string,
  updates: { label?: string; color?: string }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_status_labels")
    .update(updates)
    .eq("id", labelId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function deleteStatusLabel(companyId: string, labelId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_status_labels")
    .delete()
    .eq("id", labelId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

// ===== Board Cell Actions =====

export async function updateBoardCell(
  companyId: string,
  applicantId: string,
  columnId: string,
  columnType: "text" | "number" | "date" | "status",
  value: any
) {
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

  const { error } = await supabase
    .from("board_cells")
    .upsert(cellData, {
      onConflict: "applicant_id,column_id",
    });

  if (error) throw new Error(error.message);

  // TRIGGER AUTOMATION: Detect status change and dispatch
  if (columnType === "status" && oldStatusLabelId !== value) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: company } = await supabase.from("companies").select("account_id").eq("id", companyId).single();

    // Non-blocking dispatch
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/.*$/, '') || 'http://localhost:3000'}/api/automations/dispatch`, {
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
    }).catch((err) => console.error('Failed to dispatch automation:', err));
  }

  revalidatePath(dashPath(companyId));
}
// ===== Row (Applicant) Actions =====

export async function moveApplicant(companyId: string, applicantId: string, groupId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .update({ group_id: groupId })
    .eq("id", applicantId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function deleteApplicant(companyId: string, applicantId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .delete()
    .eq("id", applicantId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function duplicateApplicant(companyId: string, applicantId: string) {
  const supabase = await createClient();

  // Get source applicant
  const { data: source, error: readErr } = await supabase
    .from("applicants")
    .select("*")
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .single();

  if (readErr || !source) throw new Error("Applicant not found");

  // Create duplicate
  const { data: newApplicant, error } = await supabase
    .from("applicants")
    .insert({
      company_id: source.company_id,
      full_name: `${source.full_name} (Copy)`,
      email: source.email ? `copy_${source.email}` : null,
      phone: source.phone,
      status: normalizeApplicantStatus(source.status),
      group_id: source.group_id,
      job_id: source.job_id,
      resume_path: source.resume_path,
      // NOTE: `applicants.position` is an INTEGER in Postgres, so it cannot store fractional values.
      // Place the duplicate immediately after the source row.
      position: (source.position ?? 0) + 1,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Duplicate cell values
  const { data: cells } = await supabase
    .from("board_cells")
    .select("*")
    .eq("applicant_id", applicantId);

  if (cells && cells.length > 0 && newApplicant) {
    await supabase.from("board_cells").insert(
      cells.map((cell) => ({
        applicant_id: newApplicant.id,
        column_id: cell.column_id,
        value_text: cell.value_text,
        value_number: cell.value_number,
        value_date: cell.value_date,
        value_status_label_id: cell.value_status_label_id,
      }))
    );
  }

  revalidatePath(dashPath(companyId));
  return newApplicant;
}

export async function reorderApplicants(
  companyId: string,
  applicantId: string,
  newPosition: number,
  groupId: string | null
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .update({ position: newPosition, group_id: groupId })
    .eq("id", applicantId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function reorderColumns(
  companyId: string,
  columnId: string,
  newSortOrder: number
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("board_columns")
    .update({ sort_order: newSortOrder })
    .eq("id", columnId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}
