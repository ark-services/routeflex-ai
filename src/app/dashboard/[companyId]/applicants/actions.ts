"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function dashPath(companyId: string) {
  return `/dashboard/${companyId}/applicants`;
}

// ===== Seed Default Board Columns =====

/**
 * Seeds default system columns for a company's applicant board.
 * Uses board_id = companyId convention (no separate boards table).
 * Creates: Name, Email, Phone, Status columns + default status labels.
 */
export async function seedDefaultBoardColumns(companyId: string) {
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
        board_id: companyId, // Convention: board_id = companyId
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
    { label: "Interview", color: "#f59e0b", sort_order: 3 },
    { label: "Offer", color: "#10b981", sort_order: 4 },
    { label: "Rejected", color: "#ef4444", sort_order: 5 },
  ];

  const { error: labelError } = await supabase
    .from("board_status_labels")
    .insert(
      defaultLabels.map((lbl) => ({
        column_id: statusColumn.id,
        label: lbl.label,
        color: lbl.color,
        sort_order: lbl.sort_order,
      }))
    );

  if (labelError) {
    console.error("Failed to seed status labels:", labelError);
  }
}

export async function updateApplicantStatus(companyId: string, applicantId: string, status: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("applicants")
    .update({ status })
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

export async function createGroup(companyId: string, name: string) {
  const supabase = await createClient();

  // Put it at the end
  const { data: existing, error: readErr } = await supabase
    .from("board_groups")
    .select("sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (readErr) throw new Error(readErr.message);

  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase
    .from("board_groups")
    .insert({ company_id: companyId, name, sort_order: nextSort });

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

// ===== Board Column Actions =====

export async function createBoardColumn(
  companyId: string,
  name: string,
  columnType: "text" | "number" | "date" | "file" | "status"
) {
  const supabase = await createClient();

  // Get next sort order
  const { data: existing, error: readErr } = await supabase
    .from("board_columns")
    .select("sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (readErr) throw new Error(readErr.message);

  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("board_columns")
    .insert({
      board_id: companyId, // Convention: board_id = companyId
      company_id: companyId,
      name,
      type: columnType,
      sort_order: nextSort,
      is_system: false,
      settings: {},
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
  return data;
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

  revalidatePath(dashPath(companyId));
}