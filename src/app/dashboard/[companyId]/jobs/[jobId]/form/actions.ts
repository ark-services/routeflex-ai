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

  // Create corresponding board column
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
  },
  syncToBoard: boolean = true
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

  // Update corresponding board column if label changed and sync is enabled
  if (updates.label && syncToBoard) {
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
 * Update form metadata (title, description, settings)
 */
export async function updateFormMeta(
  companyId: string,
  jobId: string,
  formId: string,
  updates: {
    title?: string;
    description?: string;
    settings?: Record<string, any>;
  }
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_application_forms")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", formId)
    .eq("company_id", companyId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId, jobId));
  return data;
}

/**
 * Upload a form logo image to the private "logos" Supabase Storage bucket.
 * Returns a short-lived signed URL (1 h) for immediate display plus the
 * permanent storage path (which is what gets persisted to the DB).
 */
export async function uploadFormLogo(
  companyId: string,
  formId: string,
  formData: FormData
): Promise<{ url: string; path: string } | { error: string }> {
  const file = formData.get("logo") as File | null;

  if (!file || file.size === 0) {
    return { error: "No file provided" };
  }

  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (!allowedTypes.includes(file.type)) {
    return { error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." };
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    return { error: "File too large. Maximum 5MB." };
  }

  const supabase = await createClient();
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  // Path layout: {companyId}/{formId}/{timestamp}-{filename}
  // The first path segment (companyId) is extracted by the storage RLS policy
  // via storage.foldername(name)[1] to verify membership.
  const path = `${companyId}/${formId}/${timestamp}-${sanitizedName}`;

  const { error: uploadError } = await supabase.storage
    .from("logos")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    return { error: uploadError.message };
  }

  // Private bucket — generate a 1-hour signed URL for immediate display.
  // The path is stored separately and a fresh URL is generated on each page load.
  const { data: signedData, error: signedError } = await supabase.storage
    .from("logos")
    .createSignedUrl(path, 3600);

  if (signedError || !signedData) {
    return { error: signedError?.message ?? "Failed to generate signed URL" };
  }

  return { url: signedData.signedUrl, path };
}

/**
 * Generate a fresh 1-hour signed URL for an existing logo path.
 * Called server-side (page.tsx) on each page load so the displayed URL is
 * always valid.
 */
export async function getLogoSignedUrl(logoPath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("logos")
    .createSignedUrl(logoPath, 3600);
  return data?.signedUrl ?? null;
}

/**
 * Delete a logo file from the "logos" storage bucket.
 * Called when the user removes their logo in the Design panel.
 */
export async function deleteFormLogo(logoPath: string): Promise<void> {
  if (!logoPath) return;
  const supabase = await createClient();
  await supabase.storage.from("logos").remove([logoPath]);
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
