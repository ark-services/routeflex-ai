"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function dashPath(companyId: string, jobId: string) {
  return `/dashboard/${companyId}/jobs/${jobId}/form`;
}

/**
 * Get application form for a job
 */
export async function getApplicationForm(companyId: string, jobId: string) {
  const supabase = await createClient();

  const { data: form, error } = await supabase
    .from("job_application_forms")
    .select("id, job_id, company_id, public_token, title, description, settings")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!form) throw new Error("Application form not found for this job");
  return form;
}

/**
 * Get form fields for a form
 */
export async function getFormFields(formId: string) {
  const supabase = await createClient();

  const { data: fields, error } = await supabase
    .from("job_application_fields")
    .select("*")
    .eq("form_id", formId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return fields || [];
}

/**
 * Create a new form field
 */
export async function createFormField(
  companyId: string,
  jobId: string,
  formId: string,
  field: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    settings?: Record<string, any>;
  }
) {
  const supabase = await createClient();

  // Get max sort_order
  const { data: existing } = await supabase
    .from("job_application_fields")
    .select("sort_order")
    .eq("form_id", formId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSortOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("job_application_fields")
    .insert({
      form_id: formId,
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      sort_order: nextSortOrder,
      settings: field.settings || {},
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Create corresponding board column (if not a file field)
  if (field.type !== "file") {
    const { data: board } = await supabase
      .from("boards")
      .select("id")
      .eq("company_id", companyId)
      .eq("job_id", jobId)
      .single();

    if (board) {
      const columnType = mapFieldTypeToColumnType(field.type);
      await supabase.from("board_columns").insert({
        board_id: board.id,
        company_id: companyId,
        field_id: data.id,
        name: field.label,
        type: columnType,
        sort_order: nextSortOrder,
        is_system: false,
        settings: {},
      });
    }
  }

  revalidatePath(dashPath(companyId, jobId));
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  return data;
}

/**
 * Update a form field
 */
export async function updateFormField(
  companyId: string,
  jobId: string,
  fieldId: string,
  updates: {
    label?: string;
    required?: boolean;
    settings?: Record<string, any>;
  }
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_application_fields")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fieldId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Update corresponding board column if label changed
  if (updates.label) {
    await supabase
      .from("board_columns")
      .update({ name: updates.label })
      .eq("field_id", fieldId);
  }

  revalidatePath(dashPath(companyId, jobId));
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  return data;
}

/**
 * Soft delete a form field (preserves historical data)
 */
export async function deleteFormField(
  companyId: string,
  jobId: string,
  fieldId: string
) {
  const supabase = await createClient();

  // Soft delete the field
  const { error } = await supabase
    .from("job_application_fields")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fieldId);

  if (error) throw new Error(error.message);

  // Hide the corresponding board column (don't delete to preserve data)
  await supabase
    .from("board_columns")
    .update({ settings: { hidden: true } })
    .eq("field_id", fieldId);

  revalidatePath(dashPath(companyId, jobId));
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
}

/**
 * Reorder form fields
 */
export async function reorderFormFields(
  companyId: string,
  jobId: string,
  fieldId: string,
  newSortOrder: number
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("job_application_fields")
    .update({ sort_order: newSortOrder })
    .eq("id", fieldId);

  if (error) throw new Error(error.message);

  // Also update the corresponding board column sort order
  await supabase
    .from("board_columns")
    .update({ sort_order: newSortOrder })
    .eq("field_id", fieldId);

  revalidatePath(dashPath(companyId, jobId));
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
}

// Helper function to map form field types to board column types
function mapFieldTypeToColumnType(fieldType: string): string {
  const typeMap: Record<string, string> = {
    text: "text",
    textarea: "text",
    email: "text",
    phone: "text",
    number: "number",
    date: "date",
    file: "file",
    checkbox: "text",
    radio: "text",
    select: "text",
  };
  return typeMap[fieldType] || "text";
}
