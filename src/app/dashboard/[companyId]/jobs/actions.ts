"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertCompanyAccess } from "@/lib/rbac";
import type { JobStatus } from "@/lib/types";
import { getOrCreateApplicantsBoard } from "@/lib/boards/getOrCreateApplicantsBoard";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Job template types and configurations
type JobTemplate = "fedex_pd" | "scratch";

type GroupConfig = {
  name: string;
  color: string;
  sort_order: number;
  is_default_for_applications?: boolean;
};

// Template to group configurations mapping
const TEMPLATE_GROUPS: Record<JobTemplate, GroupConfig[]> = {
  fedex_pd: [
    { name: "New Applicants", color: "#0073ea", sort_order: 1, is_default_for_applications: true },
    { name: "Background Check", color: "#00c875", sort_order: 2 },
    { name: "Interview", color: "#fdab3d", sort_order: 3 },
    { name: "HR Paperwork", color: "#e2445c", sort_order: 4 },
  ],
  scratch: [
    { name: "New Group", color: "#0073ea", sort_order: 1, is_default_for_applications: true },
  ],
};

/**
 * Creates a new job with full form engine setup.
 * This is the new, comprehensive job creation flow that:
 * 1. Creates the job
 * 2. Creates a job-specific board
 * 3. Creates an application form with default fields
 * 4. Generates board columns from form fields (NOT hardcoded)
 * 5. Creates board groups based on selected template
 * 6. All operations are idempotent to prevent duplicates
 */
export async function addJob(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  await assertCompanyAccess(companyId);
  const title = (formData.get("title") as string).trim();
  const location = ((formData.get("location") as string | null) ?? "").trim();
  const template = (formData.get("template") as JobTemplate) || "scratch";
  const status = ((formData.get("status") as JobStatus) || "open") as JobStatus;
  const supabase = await createClient();

  const slug = slugify(title);

  console.log("[addJob] ============================================");
  console.log("[addJob] Starting job creation with template:", template);
  console.log("[addJob] ============================================");

  // ========================================================================
  // PLAN LIMIT CHECK: Verify the company hasn't hit its job limit
  // ========================================================================
  const { data: canCreate, error: limitError } = await supabase.rpc("can_create_job", {
    p_company_id: companyId,
  });
  if (limitError) {
    console.error("[addJob] Limit check error:", limitError);
  }
  if (!canCreate) {
    throw new Error("You've reached the job limit for your plan. Please upgrade to add more jobs.");
  }

  // ========================================================================
  // STEP 1: Create the job
  // ========================================================================
  console.log("[addJob] Inserting job:", { company_id: companyId, title });
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      company_id: companyId,
      title,
      slug,
      location,
      status,
    })
    .select("id")
    .single();

  console.log("[addJob] Insert result:", {
    data: job,
    error: jobError ? { message: jobError.message, code: jobError.code, details: jobError.details } : null,
  });

  if (jobError || !job) {
    throw new Error(jobError?.message || "Failed to create job");
  }

  // Best-effort seeding: do NOT block job creation if seeding fails
  try {
    // ========================================================================
    // STEP 2: Create job-specific board (using idempotent helper)
    // ========================================================================
    const templateGroups = TEMPLATE_GROUPS[template];
    const boardResult = await getOrCreateApplicantsBoard(
      supabase,
      companyId,
      job.id,
      templateGroups
    );

    if (!boardResult.success) {
      console.error("[addJob] Failed to create board:", boardResult.error);
      throw new Error(
        boardResult.error ||
          "Board creation failed: " + boardResult.technicalDetails
      );
    }

    const boardId = boardResult.board.id;
    console.log(
      `[addJob] Board ready: ${boardId} with ${boardResult.groups.length} groups`
    );

    // ========================================================================
    // STEP 3: Create application form (idempotent - check if exists first)
    // ========================================================================
    // Check if form already exists for this job
    const { data: existingForm } = await supabase
      .from("job_application_forms")
      .select("id, public_token")
      .eq("job_id", job.id)
      .maybeSingle();

    let form = existingForm;

    if (!form) {
      // Create new form
      const { data: newForm, error: formErr } = await supabase
        .from("job_application_forms")
        .insert({
          job_id: job.id,
          company_id: companyId,
          title: `${title} Application`,
          description: `Apply for the ${title} position`,
        })
        .select("id, public_token")
        .single();

      if (formErr || !newForm?.id) {
        console.error("[addJob] Failed to create application form:", formErr);
        throw formErr || new Error("Form creation failed");
      }

      form = newForm;
      console.log(`[addJob] Created form ${form.id} with token ${form.public_token}`);
    } else {
      console.log(`[addJob] Using existing form ${form.id}`);
    }

    // ========================================================================
    // STEP 4: Create default form fields using helper function
    // ========================================================================
    console.log(`[addJob] Creating form fields for template: ${template}`);
    const { error: fieldsErr } = await supabase.rpc("create_default_form_fields", {
      p_form_id: form.id,
      p_template: template,
    });

    if (fieldsErr) {
      console.error("[addJob] Failed to create default fields:", fieldsErr);
      throw fieldsErr;
    }

    // Fetch the created fields
    const { data: fields, error: fetchFieldsErr } = await supabase
      .from("job_application_fields")
      .select("id, key, label, type, sort_order, settings")
      .eq("form_id", form.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (fetchFieldsErr || !fields) {
      console.error("[addJob] Failed to fetch form fields:", fetchFieldsErr);
      throw fetchFieldsErr || new Error("Failed to fetch fields");
    }

    console.log(`[addJob] Created ${fields.length} form fields`);

    // ========================================================================
    // STEP 5: Create board columns from form fields
    // ========================================================================
    // Map form field types to board column types
    // Must stay in sync with form/actions.ts mapFieldTypeToColumnType
    const mapFieldTypeToColumnType = (fieldType: string): string => {
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
    };

    /** Auto-create status labels for select/radio columns. */
    const STATUS_LABEL_COLORS = [
      "#6b7280", "#ef4444", "#f59e0b", "#10b981", "#3b82f6",
      "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
    ];

    // Create columns from all form fields (including file uploads)
    const columnsToCreate = fields.map((field, index) => ({
      board_id: boardId,
      company_id: companyId,
      field_id: field.id,
      name: field.label,
      type: mapFieldTypeToColumnType(field.type),
      sort_order: index + 1,
      is_system: false, // All columns are now form-driven, not "system"
      settings: {},
    }));

    const { data: insertedColumns, error: colsErr } = await supabase
      .from("board_columns")
      .insert(columnsToCreate)
      .select("id, name, type");

    if (colsErr) {
      console.error("[addJob] Failed to create board columns:", colsErr);
      // If unique constraint violation, it means columns already exist (idempotent)
      if (!colsErr.message?.includes("unique")) {
        throw colsErr;
      }
    }

    // Auto-create status labels for radio/select columns
    if (insertedColumns) {
      for (const col of insertedColumns) {
        if (col.type !== "status") continue;
        const field = fields.find((f) => f.label === col.name);
        const options: string[] = (field as any)?.settings?.options ?? [];
        if (options.length === 0) continue;
        for (let i = 0; i < options.length; i++) {
          const label = String(options[i]).trim();
          if (!label) continue;
          await supabase
            .from("board_status_labels")
            .upsert(
              { column_id: col.id, label, color: STATUS_LABEL_COLORS[i % STATUS_LABEL_COLORS.length], sort_order: i },
              { onConflict: "column_id,color" }
            );
        }
      }
    }

    console.log(
      `[addJob] Created ${insertedColumns?.length || 0} board columns for template "${template}":`,
      insertedColumns?.map(c => c.name)
    );

    // ========================================================================
    // STEP 6: Board groups already created by getOrCreateApplicantsBoard
    // ========================================================================

    // ========================================================================
    // STEP 7: Create example applicant (optional, for better UX)
    // ========================================================================
    // Use first group for example applicant (works for any template)
    const firstGroup = boardResult.groups[0];
    if (firstGroup?.id) {
      const { error: applicantErr } = await supabase.from("applicants").insert({
        company_id: companyId,
        job_id: job.id,
        board_id: boardId,
        group_id: firstGroup.id,
        full_name: "Example Applicant",
        email: "example@applicant.test",
        phone: "555-555-5555",
        status: "applied",
        position: 0,
        is_sample: true,
      });

      if (applicantErr && !applicantErr.message?.includes("unique")) {
        console.error("[addJob] Failed to create example applicant:", applicantErr);
      }
    }

    console.log(`[addJob] Job ${job.id} setup completed successfully`);
  } catch (e) {
    console.error("[addJob] Job created but seeding failed:", e);
    // Job was created successfully, but setup had issues
    // We continue anyway so the user can fix it manually
  }

  // ========================================================================
  // STEP 8: Revalidate paths to ensure UI updates immediately
  // ========================================================================
  revalidatePath(`/dashboard/${companyId}`);
  revalidatePath(`/dashboard/${companyId}/jobs`);
  revalidatePath(`/dashboard/${companyId}/jobs/${job.id}`);
  revalidatePath(`/dashboard/${companyId}/jobs/${job.id}/applicants`);

  // Return the redirect URL for client-side navigation
  // (avoids NEXT_REDIRECT error being caught in client components)
  return {
    success: true,
    redirectUrl: `/dashboard/${companyId}/jobs/${job.id}/applicants`,
  };
}
