"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { TemplatePayload, TemplateColumn, TemplateForm } from "@/lib/types";

// ─── ID-remapping helper ──────────────────────────────────────────────────────
//
// Templates store automation configs with source board UUIDs AND their
// human-readable names (annotated by captureJobLayoutToTemplate with _ prefix).
// This function rewrites each UUID field to the equivalent destination ID,
// resolved by name rather than by UUID.  If a name annotation is absent (old
// template) or the destination entity can't be found, the original UUID is
// left untouched so the automation is at least created (showing a blank picker
// is better than losing the automation entirely).

function remapConfig(
  config: Record<string, unknown>,
  colNameToId: Map<string, string>,   // columnName.lower → dest column UUID
  labelMap: Map<string, string>,       // "{destColId}|{labelText.lower}" → dest label UUID
  groupNameToId: Map<string, string>  // groupName.lower → dest group UUID
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config };

  // ── Column ID (used by status trigger, change_status, set_date, set_number, inc_dec, email) ──
  if (typeof config._column_name === "string") {
    const dstColId = colNameToId.get(config._column_name.toLowerCase());
    if (dstColId) out.column_id = dstColId;
  }

  // ── Status label for trigger (changes_to) ────────────────────────────────
  if (typeof config._changes_to_label === "string") {
    const colId = out.column_id as string | undefined;
    if (colId) {
      const dstLabelId = labelMap.get(
        `${colId}|${config._changes_to_label.toLowerCase()}`
      );
      if (dstLabelId) out.changes_to = dstLabelId;
    }
  }

  // ── Status label for action (value in change_status) ─────────────────────
  if (typeof config._value_label === "string") {
    const colId = out.column_id as string | undefined;
    if (colId) {
      const dstLabelId = labelMap.get(
        `${colId}|${config._value_label.toLowerCase()}`
      );
      if (dstLabelId) out.value = dstLabelId;
    }
  }

  // ── Group ID (move_group action + applicant.moved_group trigger) ──────────
  if (typeof config._to_group_name === "string") {
    const dstGroupId = groupNameToId.get(config._to_group_name.toLowerCase());
    if (dstGroupId) out.to_group_id = dstGroupId;
  }

  // ── Email recipient column ────────────────────────────────────────────────
  if (typeof config._recipient_column_name === "string") {
    const dstColId = colNameToId.get(
      config._recipient_column_name.toLowerCase()
    );
    if (dstColId) out.recipient_column_id = dstColId;
  }

  return out;
}

// ─── Date normalizer ─────────────────────────────────────────────────────────
// Templates may store dates as "YYYY-MM-DD" (ISO) or "MM/DD/YYYY" (US locale).
// Postgres date columns require ISO.

function normalizeDate(val: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val; // already ISO
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, dy, yr] = m;
    return `${yr}-${mo.padStart(2, "0")}-${dy.padStart(2, "0")}`;
  }
  return null; // unparseable — caller should skip
}

// ─── Column type normalizer ───────────────────────────────────────────────────
// board_columns.type is always one of the schema-constrained values
// ('text', 'number', 'date', 'status', 'file', 'email', 'phone', 'location').
// Older template payloads or external captures may use synonym strings; collapse
// them to canonical form before routing cell values to the right typed column.

function normalizeColType(raw: string | undefined): string {
  switch ((raw ?? "").toLowerCase()) {
    case "number":
    case "numeric":
    case "integer":
    case "int":
    case "float":
    case "decimal":
      return "number";
    case "date":
    case "datetime":
    case "timestamp":
    case "timestamptz":
      return "date";
    default:
      return (raw ?? "text").toLowerCase();
  }
}

// ─── List published templates ────────────────────────────────────────────────

export async function listTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, title, description, thumbnail_path, is_published, created_at")
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, templates: [] };
  return { templates: data ?? [] };
}

// ─── Apply template to a job ─────────────────────────────────────────────────
//
// SAFETY:  Groups/rows/automations are CLONED into job-scoped tables.
//          The template record itself is never mutated.
//          Calling this function a second time creates additional groups
//          (intentional, gated by UI confirmation).
//
// Arguments:
//   templateId  – uuid of the template
//   jobId       – uuid of the target job
//   companyId   – uuid of the company (used for ownership checks + inserts)
//   force       – if false and a prior application exists, returns alreadyApplied
//                 if true, applies regardless

export async function applyTemplate(
  templateId: string,
  jobId: string,
  companyId: string,
  force = false
) {
  const supabase = await createClient();

  // Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Verify user is a member of this company
  const { data: company } = await supabase
    .from("companies")
    .select("account_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) return { error: "Company not found" };

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return { error: "Forbidden: not a member of this company" };

  // Verify the job belongs to this company
  const { data: job } = await supabase
    .from("jobs")
    .select("id, company_id")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!job) return { error: "Job not found or does not belong to this company" };

  // Check for prior application (idempotency warning)
  if (!force) {
    const { data: existing } = await supabase
      .from("job_template_applications")
      .select("id, applied_at")
      .eq("job_id", jobId)
      .eq("template_id", templateId)
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return {
        alreadyApplied: true,
        appliedAt: existing.applied_at,
      };
    }
  }

  // Load template
  const { data: templateData, error: tErr } = await supabase
    .from("templates")
    .select("payload")
    .eq("id", templateId)
    .single();

  if (tErr || !templateData) return { error: "Template not found" };

  const payload = templateData.payload as TemplatePayload & { columns?: TemplateColumn[] };

  // Get the job's board (must already exist — created during job setup)
  const { data: board, error: boardErr } = await supabase
    .from("boards")
    .select("id")
    .eq("job_id", jobId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (boardErr || !board) return { error: "Board not found for this job" };

  const boardId = board.id;

  // ─── Ensure payload columns exist on the target board ─────────────────────
  // Only creates non-system, non-duplicate columns. Existing columns are left
  // untouched so no data is lost.
  const payloadColumns: TemplateColumn[] = payload.columns ?? [];
  if (payloadColumns.length > 0) {
    const { data: existingCols } = await supabase
      .from("board_columns")
      .select("name, sort_order")
      .eq("board_id", boardId);

    const existingNames = new Set(
      (existingCols ?? []).map((c) => c.name.toLowerCase())
    );
    const maxExistingSortOrder = Math.max(
      0,
      ...(existingCols ?? []).map((c) => c.sort_order ?? 0)
    );

    const colsToCreate = payloadColumns.filter(
      (c) => !c.is_system && !existingNames.has(c.name.toLowerCase())
    );

    if (colsToCreate.length > 0) {
      const colInserts = colsToCreate.map((c, i) => ({
        board_id: boardId,
        company_id: companyId,
        name: c.name,
        type: c.type || "text",
        sort_order: maxExistingSortOrder + i + 1,
        is_system: false,
        settings: c.settings ?? {},
      }));

      const { error: colErr } = await supabase
        .from("board_columns")
        .insert(colInserts);

      if (colErr) {
        console.warn("[applyTemplate] Could not create some columns:", colErr.message);
        // Non-fatal — continue
      }
    }
  }

  // ─── Build destination ID-resolution maps ─────────────────────────────────
  // Fetched after column creation so newly-created columns are included.
  // These maps are shared by both the row-cell insertion and automation cloning.

  const { data: allDestCols } = await supabase
    .from("board_columns")
    .select("id, name, type")
    .eq("board_id", boardId);

  // columnName.lower → dest column UUID
  const colNameToId = new Map<string, string>(
    (allDestCols ?? []).map((c) => [c.name.toLowerCase(), c.id])
  );
  // columnName.lower → column type (needed to route status cells correctly)
  const colNameToType = new Map<string, string>(
    (allDestCols ?? []).map((c) => [c.name.toLowerCase(), c.type])
  );

  // ─── Insert template status labels ────────────────────────────────────────
  // For each status column whose template entry carries label definitions
  // (settings.labels), DELETE any existing labels on the destination column
  // (including defaults created at job setup) and INSERT the template labels.
  // This must happen before building labelMap so the map reflects final state.
  for (const tc of payloadColumns) {
    if (tc.type !== "status") continue;

    const templateLabels = (tc.settings as any)?.labels as
      | Array<{ label: string; color: string; sort_order: number }>
      | undefined;
    if (!Array.isArray(templateLabels) || templateLabels.length === 0) continue;

    const destColId = colNameToId.get(tc.name.toLowerCase());
    if (!destColId) {
      console.warn(
        `[applyTemplate] Status column "${tc.name}" not found on dest board — skipping label insert`
      );
      continue;
    }

    // Remove existing labels (defaults or prior application) so template is authoritative
    const { error: delErr } = await supabase
      .from("board_status_labels")
      .delete()
      .eq("column_id", destColId);
    if (delErr) {
      console.warn(
        `[applyTemplate] Could not clear existing labels for column "${tc.name}":`,
        delErr.message
      );
    }

    const labelInserts = templateLabels.map((l) => ({
      column_id: destColId,
      label: l.label,
      color: l.color ?? "#6b7280",
      sort_order: l.sort_order ?? 0,
    }));

    const { error: lblErr } = await supabase
      .from("board_status_labels")
      .insert(labelInserts);

    if (lblErr) {
      console.warn(
        `[applyTemplate] Could not insert labels for column "${tc.name}":`,
        lblErr.message
      );
    } else {
      console.log(
        `[applyTemplate] Status column "${tc.name}" (${destColId}) — inserted ${labelInserts.length} label(s):`,
        JSON.stringify(labelInserts)
      );
    }
  }

  // Build label map: "{destColId}|{labelText.lower}" → dest label UUID
  // Queried AFTER inserting template labels so the map reflects final state.
  // Used by both automation remapping and status-cell insertion for seed rows.
  const labelMap = new Map<string, string>();
  const statusColIds = (allDestCols ?? [])
    .filter((c) => c.type === "status")
    .map((c) => c.id);

  if (statusColIds.length > 0) {
    const { data: allLabels } = await supabase
      .from("board_status_labels")
      .select("id, column_id, label")
      .in("column_id", statusColIds);

    for (const l of allLabels ?? []) {
      labelMap.set(`${l.column_id}|${l.label.toLowerCase()}`, l.id);
    }
  }

  // ─── Load existing groups on this board for merge-by-name ─────────────────
  // Fetched before the group loop so we can detect collisions without hitting
  // the DB on every iteration.  New groups created during the loop are added
  // to this map immediately so subsequent groups can see them too.
  const { data: preExistingGroups } = await supabase
    .from("board_groups")
    .select("id, name, sort_order")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: false });

  const maxSortOrder = preExistingGroups?.[0]?.sort_order ?? 0;

  // groupName.lower → existing dest group UUID (pre-populated with existing groups)
  const groupNameToId = new Map<string, string>(
    (preExistingGroups ?? []).map((g) => [g.name.trim().toLowerCase(), g.id])
  );

  // ─── Clone groups & rows ───────────────────────────────────────────────────
  const groups = payload.groups ?? [];
  const createdGroupIds: string[] = [];

  for (const g of groups) {
    const nameKey = g.name.trim().toLowerCase();
    let destGroupId: string;

    if (groupNameToId.has(nameKey)) {
      // ── Merge: a group with this name already exists — reuse it ───────────
      destGroupId = groupNameToId.get(nameKey)!;
      console.log(
        `[applyTemplate] Merging into existing group "${g.name}" (${destGroupId})`
      );
    } else {
      // ── Create: no matching group — insert a new one ──────────────────────
      const { data: newGroup, error: gErr } = await supabase
        .from("board_groups")
        .insert({
          board_id: boardId,
          company_id: companyId,
          name: g.name,
          color: g.color ?? "#0073ea",
          sort_order: maxSortOrder + g.sort_order,
        })
        .select("id")
        .single();

      if (gErr || !newGroup) {
        console.error("[applyTemplate] Failed to create group:", gErr);
        return { error: `Failed to create group "${g.name}": ${gErr?.message}` };
      }

      destGroupId = newGroup.id;
      groupNameToId.set(nameKey, destGroupId);
      console.log(`[applyTemplate] Created new group "${g.name}" (${destGroupId})`);
    }

    createdGroupIds.push(destGroupId);

    // ── Clone seed rows into the resolved group ────────────────────────────
    const rows = g.rows ?? [];
    for (const [rowIdx, row] of rows.entries()) {
      const cells = row.cells ?? {};

      // Resolve applicant-level fields from the cells dict.
      // Support "Full Name" (our canonical key) AND separate "First Name" /
      // "Last Name" board-column keys for templates captured from boards that
      // store names split across two columns.
      const fullName =
        cells["Full Name"] ??
        cells["full_name"] ??
        [cells["First Name"], cells["Last Name"]].filter(Boolean).join(" ") ??
        "";

      const email =
        cells["Email"] ??
        cells["email"] ??
        cells["Email Address"] ??
        cells["email_address"] ??
        `seed-${jobId.slice(0, 8)}-g${g.sort_order}-r${rowIdx}@placeholder.local`;

      const phone =
        cells["Phone"] ??
        cells["phone"] ??
        cells["Phone Number"] ??
        "";

      const { data: applicant, error: appErr } = await supabase
        .from("applicants")
        .insert({
          company_id: companyId,
          job_id: jobId,
          board_id: boardId,
          group_id: destGroupId,
          full_name: fullName || `Seed Row ${rowIdx + 1}`,
          email,
          phone,
          status: "applied",
          position: rowIdx,
        })
        .select("id")
        .single();

      if (appErr || !applicant) {
        console.error(
          `[applyTemplate] Failed to create seed row ${rowIdx} in "${g.name}":`,
          appErr?.message
        );
        continue; // non-fatal — move on to next row
      }

      // ── Insert board_cells for every cell in the template row ─────────────
      // We do NOT skip "Full Name", "Email", "Phone" etc. here — if the dest
      // board has a column by that name we want to populate it.
      // colNameToId / colNameToType / labelMap are already built (no N+1).

      if (Object.keys(cells).length > 0) {
        console.log(
          `[applyTemplate] Row ${rowIdx} in "${g.name}" template cells:`,
          JSON.stringify(cells)
        );

        const cellInserts: Record<string, unknown>[] = [];
        const skipped: string[] = [];

        for (const [key, val] of Object.entries(cells)) {
          const colId = colNameToId.get(key.toLowerCase());
          if (!colId) {
            skipped.push(key);
            continue; // no matching column on dest board
          }
          // Skip only true empties; never skip 0, false, or other falsy values
          if (val === null || val === undefined || val === "") continue;

          // normalizeColType collapses synonyms (numeric→number, timestamp→date, etc.)
          const rawColType = colNameToType.get(key.toLowerCase());
          const colType = normalizeColType(rawColType);

          console.log(
            `[applyTemplate] cell "${key}" → colId=${colId} destType="${rawColType}"→"${colType}" val=${JSON.stringify(val)}`
          );

          if (colType === "status") {
            // val is the label TEXT stored by captureJobLayoutToTemplate
            const labelId = labelMap.get(`${colId}|${String(val).toLowerCase()}`);
            if (!labelId) {
              console.warn(
                `[applyTemplate] Status label "${val}" not found on dest board for column "${key}"`
              );
              skipped.push(`${key}="${val}" (label not found)`);
              continue;
            }
            console.log(
              `[applyTemplate] → value_status_label_id=${labelId}`
            );
            cellInserts.push({
              applicant_id: applicant.id,
              column_id: colId,
              value_status_label_id: labelId,
            });
          } else if (colType === "date") {
            // Normalize to ISO "YYYY-MM-DD"; template may store "MM/DD/YYYY"
            const isoDate = normalizeDate(String(val));
            if (!isoDate) {
              console.warn(
                `[applyTemplate] Could not parse date "${val}" for column "${key}" — skipping`
              );
              skipped.push(`${key}="${val}" (unparseable date)`);
              continue;
            }
            console.log(`[applyTemplate] → value_date="${isoDate}"`);
            cellInserts.push({
              applicant_id: applicant.id,
              column_id: colId,
              value_date: isoDate,
            });
          } else if (colType === "number") {
            const num = parseFloat(String(val));
            if (isNaN(num)) {
              console.warn(
                `[applyTemplate] Could not parse number "${val}" for column "${key}" — skipping`
              );
              skipped.push(`${key}="${val}" (unparseable number)`);
              continue;
            }
            console.log(`[applyTemplate] → value_number=${num}`);
            cellInserts.push({
              applicant_id: applicant.id,
              column_id: colId,
              value_number: num,
            });
          } else {
            // text, email, phone, location, file → value_text
            cellInserts.push({
              applicant_id: applicant.id,
              column_id: colId,
              value_text: String(val),
            });
          }
        }

        if (skipped.length > 0) {
          console.log(
            `[applyTemplate] Row ${rowIdx} in "${g.name}" — skipped unmapped keys: ${skipped.join(", ")}`
          );
        }

        if (cellInserts.length > 0) {
          const { error: cellErr } = await supabase
            .from("board_cells")
            .insert(cellInserts as any[]);

          if (cellErr) {
            console.warn(
              `[applyTemplate] Could not insert cells for row ${rowIdx} in "${g.name}":`,
              cellErr.message
            );
          } else {
            console.log(
              `[applyTemplate] ✓ Row ${rowIdx} in "${g.name}": inserted ${cellInserts.length} cell(s)`
            );
          }
        }
      }
    }
  }

  // ─── Clone automations (best-effort, non-blocking) ────────────────────────
  //
  // Each automation's filter (trigger config) and every action config may
  // reference source-board UUIDs (column IDs, status label IDs, group IDs).
  // remapConfig() rewrites those using the _name annotations that
  // captureJobLayoutToTemplate wrote, resolving to destination board UUIDs.
  //
  // If remapping fails for any field (annotation missing, entity renamed), the
  // original UUID is left in place — the automation is still created so the
  // user can fix it manually rather than losing it entirely.

  const automations = payload.automations ?? [];
  for (const auto of automations) {
    try {
      // auto.type IS the trigger_key (set by captureJobLayoutToTemplate)
      const triggerKey = auto.type ?? "applicant.created";

      const remappedFilter = remapConfig(
        auto.config as Record<string, unknown>,
        colNameToId,
        labelMap,
        groupNameToId
      );

      const { data: newAutomation, error: autoInsertErr } = await supabase
        .from("automations")
        .insert({
          company_id: companyId,
          job_id: jobId,
          name: auto.name ?? `${triggerKey} (from template)`,
          trigger_key: triggerKey,
          filter: remappedFilter,
          is_enabled: false, // user enables manually after reviewing
        })
        .select("id")
        .single();

      if (autoInsertErr || !newAutomation) {
        console.warn(
          "[applyTemplate] Could not create automation:",
          autoInsertErr?.message
        );
        continue; // best-effort, non-blocking
      }

      // Insert automation_actions.
      // BUG FIX: company_id was previously omitted, causing a NOT NULL
      // constraint violation and silently dropping all actions ("0 actions").
      if (Array.isArray(auto.actions) && auto.actions.length > 0) {
        const actionInserts = auto.actions.map((action: any) => ({
          automation_id: newAutomation.id,
          company_id: companyId,   // ← was missing; this is the primary fix
          job_id: jobId,
          type: action.type,
          sort_order: action.sort_order ?? 0,
          config: remapConfig(
            action.config ?? {},
            colNameToId,
            labelMap,
            groupNameToId
          ),
        }));

        const { error: actErr } = await supabase
          .from("automation_actions")
          .insert(actionInserts);

        if (actErr) {
          console.warn(
            "[applyTemplate] Could not clone automation_actions:",
            actErr.message
          );
        }
      }
    } catch (autoErr) {
      console.warn("[applyTemplate] Skipping automation (insert failed):", autoErr);
    }
  }

  // ─── Apply template Application Form ─────────────────────────────────────
  //
  // Strategy: REPLACE.  We upsert all template fields (keyed by form_id+key)
  // and deactivate any active fields on the destination form that are not in
  // the template.  The unique constraint (form_id, key) makes upsert safe even
  // when a key was previously soft-deleted.
  //
  // Logo assets are copied from the source company's storage path to the
  // destination company's path using the service-role client so we can read
  // across company boundaries.  The destination form is then updated to point
  // at the new path; logoUrl is left absent (it will be generated fresh via
  // getLogoSignedUrl on next form-builder page load).

  const templateForm = payload.form as TemplateForm | undefined;

  if (templateForm) {
    const { data: destForm } = await supabase
      .from("job_application_forms")
      .select("id, settings")
      .eq("job_id", jobId)
      .maybeSingle();

    if (!destForm) {
      console.warn(
        "[applyTemplate] No application form found for destination job — skipping form apply"
      );
    } else {
      // ── 1. Copy logo asset if present ─────────────────────────────────────
      let resolvedLogoPath: string | undefined;

      if (templateForm.design?.logoPath) {
        const srcPath = templateForm.design.logoPath;
        const srcFilename = srcPath.split("/").pop() ?? "logo.jpg";
        const destPath = `${companyId}/${destForm.id}/${Date.now()}-${srcFilename}`;

        try {
          const svcClient = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
          );

          const { data: fileBlob, error: dlErr } = await svcClient.storage
            .from("logos")
            .download(srcPath);

          if (dlErr || !fileBlob) {
            console.warn(
              `[applyTemplate] Could not download logo "${srcPath}":`,
              dlErr?.message
            );
          } else {
            const { error: ulErr } = await svcClient.storage
              .from("logos")
              .upload(destPath, fileBlob, { upsert: true });

            if (ulErr) {
              console.warn(
                `[applyTemplate] Could not upload logo to "${destPath}":`,
                ulErr.message
              );
            } else {
              resolvedLogoPath = destPath;
              console.log(
                `[applyTemplate] Logo asset copied: "${srcPath}" → "${destPath}"`
              );
            }
          }
        } catch (assetErr) {
          console.warn("[applyTemplate] Logo copy failed (non-fatal):", assetErr);
        }
      } else {
        console.log("[applyTemplate] Template form has no logo asset — skipping asset copy");
      }

      // ── 2. Update form metadata + design ──────────────────────────────────
      const existingSettings = (destForm.settings as Record<string, unknown>) ?? {};
      const newDesign: Record<string, unknown> = {};
      if (templateForm.design?.backgroundColor) {
        newDesign.backgroundColor = templateForm.design.backgroundColor;
      }
      if (resolvedLogoPath) {
        newDesign.logoPath = resolvedLogoPath;
        // logoUrl intentionally absent — generated on next page load
      }

      const { error: formMetaErr } = await supabase
        .from("job_application_forms")
        .update({
          title: templateForm.title,
          description: templateForm.description,
          settings: { ...existingSettings, design: newDesign },
        })
        .eq("id", destForm.id);

      if (formMetaErr) {
        console.warn(
          "[applyTemplate] Could not update form metadata:",
          formMetaErr.message
        );
      } else {
        console.log(
          `[applyTemplate] Form metadata updated — title: "${templateForm.title}", design:`,
          JSON.stringify(newDesign)
        );
      }

      // ── 3. Determine which existing active fields to deactivate ───────────
      //    Computed BEFORE upsert so the set isn't polluted by newly written rows.
      const templateKeys = new Set(templateForm.fields.map((f) => f.key));

      const { data: currentActiveFields } = await supabase
        .from("job_application_fields")
        .select("id, key")
        .eq("form_id", destForm.id)
        .eq("is_active", true);

      const toDeactivateIds = (currentActiveFields ?? [])
        .filter((f) => !templateKeys.has(f.key))
        .map((f) => f.id);

      // ── 4. Upsert template fields ──────────────────────────────────────────
      //    ON CONFLICT (form_id, key) → UPDATE all columns so existing active
      //    or soft-deleted rows are brought up to template spec.
      if (templateForm.fields.length > 0) {
        const fieldUpserts = templateForm.fields.map((f) => ({
          form_id: destForm.id,
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required ?? false,
          sort_order: f.sort_order ?? 0,
          is_active: true,
          settings: f.settings ?? {},
        }));

        const { error: fieldErr } = await supabase
          .from("job_application_fields")
          .upsert(fieldUpserts, { onConflict: "form_id,key" });

        if (fieldErr) {
          console.warn(
            "[applyTemplate] Could not upsert form fields:",
            fieldErr.message
          );
        } else {
          console.log(
            `[applyTemplate] ✓ Form fields upserted: ${templateForm.fields.length} field(s)`
          );
        }
      }

      // ── 5. Deactivate fields not present in the template ──────────────────
      if (toDeactivateIds.length > 0) {
        const { error: deactErr } = await supabase
          .from("job_application_fields")
          .update({ is_active: false })
          .in("id", toDeactivateIds);

        if (deactErr) {
          console.warn(
            "[applyTemplate] Could not deactivate removed fields:",
            deactErr.message
          );
        } else {
          console.log(
            `[applyTemplate] Deactivated ${toDeactivateIds.length} field(s) not present in template`
          );
        }
      }
    }
  } else {
    console.log(
      "[applyTemplate] Template has no form payload — skipping application form apply"
    );
  }

  // ─── Record application ───────────────────────────────────────────────────
  await supabase.from("job_template_applications").insert({
    job_id: jobId,
    template_id: templateId,
    applied_by: user.id,
  });

  // Revalidate the job board view
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);

  return {
    success: true,
    redirectUrl: `/dashboard/${companyId}/jobs/${jobId}/applicants`,
    groupsCreated: createdGroupIds.length,
  };
}
