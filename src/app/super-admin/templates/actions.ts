"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import type { TemplatePayload, TemplateForm } from "@/lib/types";

// ─── Annotation helpers ───────────────────────────────────────────────────────
//
// When a template is captured, automation configs contain raw UUIDs from the
// source board (column_id, label IDs, group_id).  These UUIDs are meaningless
// on any other board, so we annotate each UUID field with its human-readable
// name (prefixed with _).  applyTemplate uses these annotations to remap IDs
// to the destination board by name rather than by UUID.

function annotateFilter(
  filter: Record<string, unknown>,
  colIdToName: Map<string, string>,
  labelIdToText: Map<string, string>,
  groupIdToName: Map<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...filter };
  if (typeof filter.column_id === "string") {
    const name = colIdToName.get(filter.column_id);
    if (name) out._column_name = name;
  }
  if (typeof filter.changes_to === "string") {
    const text = labelIdToText.get(filter.changes_to);
    if (text) out._changes_to_label = text;
  }
  if (typeof filter.to_group_id === "string") {
    const name = groupIdToName.get(filter.to_group_id);
    if (name) out._to_group_name = name;
  }

  // Annotate "and only if…" conditions so applyTemplate can remap UUIDs by name
  if (Array.isArray(filter.conditions)) {
    out.conditions = (filter.conditions as Record<string, unknown>[]).map((cond) => {
      const annotated: Record<string, unknown> = { ...cond };
      // Annotate column_id → _column_name for all column-based conditions
      if (typeof cond.column_id === "string") {
        const name = colIdToName.get(cond.column_id);
        if (name) annotated._column_name = name;
      }
      // Annotate status label value → _value_label for status_is / status_is_not
      if (
        (cond.type === "status_is" || cond.type === "status_is_not") &&
        typeof cond.value === "string"
      ) {
        const labelText = labelIdToText.get(cond.value);
        if (labelText) annotated._value_label = labelText;
      }
      // Annotate group value → _value_group_name for item_in_group
      if (cond.type === "item_in_group" && typeof cond.value === "string") {
        const groupName = groupIdToName.get(cond.value);
        if (groupName) annotated._value_group_name = groupName;
      }
      return annotated;
    });
  }

  return out;
}

function annotateActionConfig(
  actionType: string,
  config: Record<string, unknown>,
  colIdToName: Map<string, string>,
  labelIdToText: Map<string, string>,
  groupIdToName: Map<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config };
  // column_id appears in change_status, set_date, set_number, inc_dec, email actions
  if (typeof config.column_id === "string") {
    const name = colIdToName.get(config.column_id);
    if (name) out._column_name = name;
  }
  // value is a status label ID for change_status actions
  if (actionType === "change_status" && typeof config.value === "string") {
    const text = labelIdToText.get(config.value);
    if (text) out._value_label = text;
  }
  // move_group and applicant.moved_group filter both use to_group_id
  if (typeof config.to_group_id === "string") {
    const name = groupIdToName.get(config.to_group_id);
    if (name) out._to_group_name = name;
  }
  // email actions reference a recipient column
  if (typeof config.recipient_column_id === "string") {
    const name = colIdToName.get(config.recipient_column_id);
    if (name) out._recipient_column_name = name;
  }
  return out;
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    throw new Error("Unauthorized");
  }
  return { supabase, user };
}

function makeServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Create ──────────────────────────────────────────────────────────────────
// Payload is intentionally empty on creation — it is populated later via
// "Save as Template…" from an actual job board (captureJobLayoutToTemplate).

export async function createTemplate(formData: FormData) {
  const { supabase, user } = await requireSuperAdmin();

  const title = (formData.get("title") as string).trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const isPublished = formData.get("is_published") === "true";

  if (!title) return { error: "Title is required" };

  const { data, error } = await supabase
    .from("templates")
    .insert({
      title,
      description,
      payload: { groups: [], automations: [] },
      is_published: isPublished,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message || "Failed to create template" };

  revalidatePath("/super-admin/templates");
  redirect(`/super-admin/templates/${data.id}`);
}

// ─── Update metadata only ─────────────────────────────────────────────────────
// Payload is NOT touched here — it is managed via captureJobLayoutToTemplate.

export async function updateTemplate(templateId: string, formData: FormData) {
  const { supabase } = await requireSuperAdmin();

  const title = (formData.get("title") as string).trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const isPublished = formData.get("is_published") === "true";

  if (!title) return { error: "Title is required" };

  const { error } = await supabase
    .from("templates")
    .update({ title, description, is_published: isPublished })
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath("/super-admin/templates");
  revalidatePath(`/super-admin/templates/${templateId}`);
  return { success: true };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTemplate(templateId: string) {
  const { supabase } = await requireSuperAdmin();

  // Soft-delete: set deleted_at instead of hard-deleting so that
  // job_template_applications FK references remain intact.
  const { error } = await supabase
    .from("templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId)
    .is("deleted_at", null); // no-op if already deleted

  if (error) return { error: error.message };

  revalidatePath("/super-admin/templates");
  return { success: true };
}

// ─── Thumbnail upload ─────────────────────────────────────────────────────────

export async function uploadThumbnail(templateId: string, formData: FormData) {
  await requireSuperAdmin();
  const serviceClient = makeServiceClient();

  const file = formData.get("file") as File | null;
  if (!file) return { error: "No file provided" };

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `thumbnails/${templateId}/${Date.now()}.${ext}`;

  const { error: upErr } = await serviceClient.storage
    .from("templates")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (upErr) return { error: upErr.message };

  const supabase = await createClient();
  const { error: dbErr } = await supabase
    .from("templates")
    .update({ thumbnail_path: path })
    .eq("id", templateId);

  if (dbErr) return { error: dbErr.message };

  revalidatePath(`/super-admin/templates/${templateId}`);
  return { success: true, path };
}

// ─── Capture job layout into template ────────────────────────────────────────
//
// Reads the current board layout (groups + columns + automations + optional
// seed rows) from a real job and writes it into the template's payload.
//
// target:
//   { templateId: string }             — update an existing template
//   { title: string; description: string } — create a new template first

export async function captureJobLayoutToTemplate(
  companyId: string,
  jobId: string,
  target:
    | { templateId: string }
    | { title: string; description: string },
  includeSeedRows: boolean
): Promise<{ success?: true; templateId?: string; error?: string }> {
  const { supabase, user } = await requireSuperAdmin();

  // ── 1. Verify job/company access ──────────────────────────────────────────
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!job) return { error: "Job not found" };

  // ── 2. Get canonical board ────────────────────────────────────────────────
  const { data: board } = await supabase
    .from("boards")
    .select("id")
    .eq("job_id", jobId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!board) return { error: "No board found for this job" };
  const boardId = board.id;

  // ── 3. Fetch board groups ─────────────────────────────────────────────────
  const { data: rawGroups } = await supabase
    .from("board_groups")
    .select("id, name, color, sort_order")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true });

  const groups = rawGroups ?? [];

  // ── 4. Fetch board columns ────────────────────────────────────────────────
  const { data: rawColumns } = await supabase
    .from("board_columns")
    .select("id, name, type, sort_order, is_system, settings")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true });

  // ── 4a. Build lookup maps needed for annotation ───────────────────────────
  const colIdToName = new Map<string, string>(
    (rawColumns ?? []).map((c) => [c.id, c.name])
  );
  const colIdToType = new Map<string, string>(
    (rawColumns ?? []).map((c) => [c.id, c.type])
  );
  const groupIdToName = new Map<string, string>(
    groups.map((g) => [g.id, g.name])
  );

  // Fetch all status labels — used for two purposes:
  //   1. Annotation: resolve label UUID → label text for automation configs
  //   2. Settings embedding: store portable label definitions (name + color +
  //      order) directly in each status column's settings so the template
  //      carries the full label schema, not just an empty settings: {}.
  const statusColIds = (rawColumns ?? [])
    .filter((c) => c.type === "status")
    .map((c) => c.id);

  const labelIdToText = new Map<string, string>();
  const colIdToLabels = new Map<
    string,
    Array<{ label: string; color: string; sort_order: number }>
  >();

  if (statusColIds.length > 0) {
    const { data: allLabels } = await supabase
      .from("board_status_labels")
      .select("id, column_id, label, color, sort_order")
      .in("column_id", statusColIds)
      .order("sort_order", { ascending: true });

    console.log(
      "[captureJobLayoutToTemplate] status labels fetched from DB:",
      JSON.stringify(allLabels, null, 2)
    );

    for (const l of allLabels ?? []) {
      // Purpose 1: automation annotation
      labelIdToText.set(l.id, l.label);
      // Purpose 2: column settings embedding
      if (!colIdToLabels.has(l.column_id)) {
        colIdToLabels.set(l.column_id, []);
      }
      colIdToLabels.get(l.column_id)!.push({
        label: l.label,
        color: l.color,
        sort_order: l.sort_order,
      });
    }
  }

  // Build columns array — for status columns, embed label definitions into
  // settings so the template carries portable label metadata rather than
  // board-specific UUIDs.
  const columns = (rawColumns ?? []).map((c) => {
    let settings: Record<string, unknown> = c.settings ?? {};
    if (c.type === "status") {
      const labels = colIdToLabels.get(c.id) ?? [];
      settings = { ...settings, labels };
      console.log(
        `[captureJobLayoutToTemplate] Status column "${c.name}" (id: ${c.id}) settings to be stored:`,
        JSON.stringify(settings)
      );
    }
    return {
      name: c.name,
      type: c.type,
      sort_order: c.sort_order,
      is_system: c.is_system ?? false,
      settings,
    };
  });

  console.log(
    "[captureJobLayoutToTemplate] payload.columns to be written:",
    JSON.stringify(columns, null, 2)
  );

  // ── 5. Fetch automations + their actions ──────────────────────────────────
  const { data: rawAutomations } = await supabase
    .from("automations")
    .select(`
      id,
      name,
      trigger_key,
      filter,
      automation_actions (
        type,
        sort_order,
        config
      )
    `)
    .eq("company_id", companyId)
    .eq("job_id", jobId);

  // Annotate each automation's filter and action configs with name fields so
  // applyTemplate can remap UUIDs to the destination board by name.
  const automations = (rawAutomations ?? []).map((a: any) => ({
    type: a.trigger_key,
    name: a.name,
    config: annotateFilter(
      a.filter ?? {},
      colIdToName,
      labelIdToText,
      groupIdToName
    ),
    actions: (a.automation_actions ?? []).map((act: any) => ({
      type: act.type,
      sort_order: act.sort_order ?? 0,
      config: annotateActionConfig(
        act.type,
        act.config ?? {},
        colIdToName,
        labelIdToText,
        groupIdToName
      ),
    })),
  }));

  // ── 6. Build payload groups (+ optional seed rows) ────────────────────────

  const payloadGroups = await Promise.all(
    groups.map(async (g) => {
      let rows: Array<{ cells: Record<string, string> }> = [];

      if (includeSeedRows) {
        // Fetch up to 25 applicants for this group
        const { data: applicants } = await supabase
          .from("applicants")
          .select("id, full_name, email, phone")
          .eq("group_id", g.id)
          .eq("job_id", jobId)
          .order("position", { ascending: true })
          .limit(25);

        if (applicants && applicants.length > 0) {
          const applicantIds = applicants.map((a) => a.id);

          // Fetch board cells — typed value columns so date/number/status
          // values are all captured (value_text alone misses them).
          const { data: cells } = await supabase
            .from("board_cells")
            .select(
              "applicant_id, column_id, value_text, value_number, value_date, value_status_label_id"
            )
            .in("applicant_id", applicantIds);

          const cellsByApplicant = new Map<string, Record<string, string>>();
          for (const cell of cells ?? []) {
            if (!cellsByApplicant.has(cell.applicant_id)) {
              cellsByApplicant.set(cell.applicant_id, {});
            }
            const colName = colIdToName.get(cell.column_id);
            if (!colName) continue;

            const colType = colIdToType.get(cell.column_id);
            if (colType === "status" && cell.value_status_label_id) {
              // Resolve to label text so the value is portable across boards
              const labelText = labelIdToText.get(cell.value_status_label_id);
              if (labelText) {
                cellsByApplicant.get(cell.applicant_id)![colName] = labelText;
              }
            } else if (colType === "date" && cell.value_date) {
              // value_date is a Postgres date → already ISO "YYYY-MM-DD"
              cellsByApplicant.get(cell.applicant_id)![colName] = cell.value_date;
            } else if (
              colType === "number" &&
              cell.value_number !== null &&
              cell.value_number !== undefined
            ) {
              // Store as string; applyTemplate parses it back with parseFloat
              cellsByApplicant.get(cell.applicant_id)![colName] = String(cell.value_number);
            } else if (cell.value_text) {
              cellsByApplicant.get(cell.applicant_id)![colName] = cell.value_text;
            }
          }

          rows = applicants.map((a) => ({
            cells: {
              "Full Name": a.full_name ?? "",
              Email: a.email ?? "",
              Phone: a.phone ?? "",
              ...(cellsByApplicant.get(a.id) ?? {}),
            },
          }));
        }
      }

      return {
        name: g.name,
        color: g.color ?? "#0073ea",
        sort_order: g.sort_order,
        rows,
      };
    })
  );

  // ── 7. Capture application form ───────────────────────────────────────────
  //
  // Reads the job's application form (job_application_forms + active fields).
  // Design settings are included but logoUrl is intentionally stripped — signed
  // URLs are ephemeral and must not be stored.  logoPath (the stable storage
  // key) is kept so applyTemplate can copy the file to the destination company.

  let templateForm: TemplateForm | undefined;

  const { data: srcForm } = await supabase
    .from("job_application_forms")
    .select("id, title, description, settings")
    .eq("job_id", jobId)
    .maybeSingle();

  if (srcForm) {
    const { data: srcFields } = await supabase
      .from("job_application_fields")
      .select("key, label, type, required, sort_order, settings")
      .eq("form_id", srcForm.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const srcDesign = (srcForm.settings as any)?.design ?? {};
    const templateDesign: TemplateForm["design"] = {};
    if (srcDesign.backgroundColor) templateDesign.backgroundColor = srcDesign.backgroundColor;
    // logoUrl omitted intentionally — only keep the stable storage path
    if (srcDesign.logoPath) templateDesign.logoPath = srcDesign.logoPath;

    templateForm = {
      title: srcForm.title ?? "Application Form",
      description: srcForm.description ?? null,
      fields: (srcFields ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required ?? false,
        sort_order: f.sort_order ?? 0,
        settings: (f.settings as Record<string, unknown>) ?? {},
      })),
      design: templateDesign,
    };

    console.log(
      `[captureJobLayoutToTemplate] form captured: ${templateForm.fields.length} field(s), ` +
        `design: ${JSON.stringify(templateDesign)}`
    );
  } else {
    console.warn(
      "[captureJobLayoutToTemplate] No application form found for this job — payload.form will be absent"
    );
  }

  const payload: TemplatePayload = {
    groups: payloadGroups,
    columns,
    automations,
    form: templateForm,
  };

  // ── 8. Resolve templateId (create new or reuse existing) ─────────────────
  let templateId: string;

  if ("templateId" in target) {
    templateId = target.templateId;
  } else {
    const { data: newTemplate, error: tErr } = await supabase
      .from("templates")
      .insert({
        title: target.title.trim(),
        description: target.description?.trim() || null,
        payload,
        is_published: false, // start as draft
        created_by: user.id,
      })
      .select("id")
      .single();

    if (tErr || !newTemplate) return { error: tErr?.message || "Failed to create template" };
    templateId = newTemplate.id;

    revalidatePath("/super-admin/templates");
    return { success: true, templateId };
  }

  // ── 9. Update existing template payload ────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("templates")
    .update({ payload })
    .eq("id", templateId);

  if (updateErr) return { error: updateErr.message };

  revalidatePath("/super-admin/templates");
  revalidatePath(`/super-admin/templates/${templateId}`);
  return { success: true, templateId };
}
