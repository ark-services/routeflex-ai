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
    const { data: newCol } = await supabase
      .from("board_columns")
      .insert({
        board_id: board.id,
        company_id: companyId,
        field_id: data.id,
        name: field.label,
        type: columnType,
        sort_order: nextSortOrder,
        is_system: false,
        settings: {},
        // Stamp canonical system_key so reconcile can re-link by key if the
        // column is ever hard-deleted from the board.
        system_key: CANONICAL_KEYS.has(field.key) ? field.key : null,
      })
      .select("id")
      .single();

    // For select/radio fields, auto-create a status label per option
    if (newCol && (field.type === "select" || field.type === "radio")) {
      const options: string[] = (field.settings as any)?.options ?? [];
      if (options.length > 0) {
        await createStatusLabelsForColumn(supabase, newCol.id, options);
      }
    }
  }

  revalidatePath(dashPath(companyId, jobId));
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  return data;
}

/**
 * Reorder form fields by updating their sort_order values.
 * fieldIds should be the full ordered list of field IDs.
 */
export async function reorderFormFields(
  companyId: string,
  jobId: string,
  fieldIds: string[]
) {
  const supabase = await createClient();
  await Promise.all(
    fieldIds.map((id, index) =>
      supabase
        .from("job_application_fields")
        .update({ sort_order: index + 1 })
        .eq("id", id)
    )
  );
  revalidatePath(dashPath(companyId, jobId));
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

// Helper function to map form field types to board column types
function mapFieldTypeToColumnType(fieldType: string): string {
  const typeMap: Record<string, string> = {
    text: "text",
    textarea: "text",
    email: "email",
    phone: "phone",
    number: "number",
    date: "date",
    file: "file",
    checkbox: "checkbox",
    radio: "status",
    select: "status",
    location: "location",
  };
  return typeMap[fieldType] || "text";
}

/** Default color palette for auto-generated status labels. */
const STATUS_LABEL_COLORS = [
  "#6b7280", // gray
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#06b6d4", // cyan
];

/**
 * Insert one status label per option for a newly-created board column.
 * Silently skips duplicates (unique constraint on column_id + color).
 */
async function createStatusLabelsForColumn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  columnId: string,
  options: string[]
) {
  for (let i = 0; i < options.length; i++) {
    const label = String(options[i]).trim();
    if (!label) continue;
    const color = STATUS_LABEL_COLORS[i % STATUS_LABEL_COLORS.length];
    await supabase
      .from("board_status_labels")
      .upsert({ column_id: columnId, label, color, sort_order: i }, { onConflict: "column_id,color" });
  }
}

/**
 * The set of field keys that are treated as "canonical" (system-defined).
 * Matching by system_key lets reconciliation restore columns even when the
 * board_columns row was hard-deleted and the field_id FK is no longer present.
 */
const CANONICAL_KEYS = new Set(["first_name", "last_name", "email", "phone"]);

/**
 * Ensure every active form question has a corresponding board column.
 *
 * Run this when:
 *   - The form builder loads (catches stale state from deleted columns)
 *   - The user toggles "Sync questions" from OFF → ON
 *
 * Strategy per field (in priority order):
 *   1. Direct link  — board_columns.field_id = field.id  → already synced, skip
 *   2. Canonical    — field.key in CANONICAL_KEYS
 *                     → find column with matching system_key, re-link it
 *   3. Title match  — case-insensitive, only if exactly one unlinked column
 *                     matches (ambiguous → skip and create fresh)
 *   4. Create new   — insert a new board_columns row and link it
 *
 * Returns counts of created / re-linked columns so the caller can show a toast.
 */
export async function reconcileSyncedColumns(
  companyId: string,
  jobId: string,
  formId: string
): Promise<{ created: number; linked: number }> {
  const supabase = await createClient();

  // 1. Active form fields, in sort order
  const { data: fields } = await supabase
    .from("job_application_fields")
    .select("id, key, label, type, sort_order, settings")
    .eq("form_id", formId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!fields || fields.length === 0) return { created: 0, linked: 0 };

  // 2. Applicants board for this job
  const { data: board } = await supabase
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .single();

  if (!board) return { created: 0, linked: 0 };

  // 3. All existing columns for this board (including hidden ones)
  const { data: columns } = await supabase
    .from("board_columns")
    .select("id, field_id, name, type, system_key")
    .eq("board_id", board.id);

  const existingColumns = columns ?? [];

  let created = 0;
  let linked = 0;

  for (const field of fields) {
    // ── Step 1: direct link already exists ──────────────────────────────────
    const directMatch = existingColumns.find((c) => c.field_id === field.id);
    if (directMatch) {
      // Correct the column type if it no longer matches (e.g. text → status
      // after the select/radio mapping was introduced).
      const expectedType = mapFieldTypeToColumnType(field.type);
      if ((directMatch as any).type !== expectedType) {
        await supabase
          .from("board_columns")
          .update({ type: expectedType })
          .eq("id", directMatch.id);
        // Seed status labels for newly-promoted status columns
        if (expectedType === "status") {
          const options: string[] = (field as any).settings?.options ?? [];
          if (options.length > 0) {
            await createStatusLabelsForColumn(supabase, directMatch.id, options);
          }
        }
      }
      continue;
    }

    // ── Step 2: canonical key match (system_key) ────────────────────────────
    let matchedColumn: (typeof existingColumns)[number] | undefined;

    if (CANONICAL_KEYS.has(field.key)) {
      matchedColumn = existingColumns.find(
        (c) => c.system_key === field.key && !c.field_id
      );
      // If the canonical column already has a field_id (pointing elsewhere),
      // treat it as taken — fall through to create.
    }

    // ── Step 3: unique case-insensitive title match (unlinked columns only) ─
    if (!matchedColumn) {
      const normalized = field.label.toLowerCase().trim();
      const titleMatches = existingColumns.filter(
        (c) => !c.field_id && c.name.toLowerCase().trim() === normalized
      );
      // Only link when there is exactly one candidate — ambiguous → create new
      if (titleMatches.length === 1) {
        matchedColumn = titleMatches[0];
      }
    }

    if (matchedColumn) {
      // Re-link the existing column to this field, and correct type if needed
      const expectedType = mapFieldTypeToColumnType(field.type);
      await supabase
        .from("board_columns")
        .update({
          field_id: field.id,
          type: expectedType,
          // Preserve or assign system_key for canonical fields
          ...(CANONICAL_KEYS.has(field.key) && !matchedColumn.system_key
            ? { system_key: field.key }
            : {}),
        })
        .eq("id", matchedColumn.id);

      // Seed status labels when linking to a status-type field
      if (expectedType === "status") {
        const options: string[] = (field as any).settings?.options ?? [];
        if (options.length > 0) {
          await createStatusLabelsForColumn(supabase, matchedColumn.id, options);
        }
      }

      // Update local cache so subsequent iterations don't double-match
      matchedColumn.field_id = field.id;
      linked++;
    } else {
      // ── Step 4: create a brand-new board column ────────────────────────────
      const columnType = mapFieldTypeToColumnType(field.type);
      const { data: newCol } = await supabase
        .from("board_columns")
        .insert({
          board_id: board.id,
          company_id: companyId,
          field_id: field.id,
          name: field.label,
          type: columnType,
          sort_order: field.sort_order,
          is_system: false,
          settings: {},
          system_key: CANONICAL_KEYS.has(field.key) ? field.key : null,
        })
        .select("id")
        .single();

      // For select/radio fields, auto-create a status label per option
      if (newCol && (field.type === "select" || field.type === "radio")) {
        const options: string[] = (field as any).settings?.options ?? [];
        if (options.length > 0) {
          await createStatusLabelsForColumn(supabase, newCol.id, options);
        }
      }

      created++;
    }
  }

  revalidatePath(dashPath(companyId, jobId));
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);

  return { created, linked };
}
