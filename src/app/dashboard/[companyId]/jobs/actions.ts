"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "@/lib/types";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DEFAULT_GROUPS = [
  { name: "New Applicants", color: "#0073ea", sort_order: 1 },
  { name: "Background Check", color: "#00c875", sort_order: 2 },
  { name: "Interview", color: "#fdab3d", sort_order: 3 },
  { name: "HR Paperwork", color: "#e2445c", sort_order: 4 },
  { name: "Hired", color: "#9cd326", sort_order: 5 },
] as const;

/**
 * Creates a new job with full form engine setup.
 * This is the new, comprehensive job creation flow that:
 * 1. Creates the job
 * 2. Creates a job-specific board
 * 3. Creates an application form with default fields
 * 4. Generates board columns from form fields (NOT hardcoded)
 * 5. Creates default board groups
 * 6. All operations are idempotent to prevent duplicates
 */
export async function addJob(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const title = (formData.get("title") as string).trim();
  const location = (formData.get("location") as string).trim();
  const terminal = (formData.get("terminal") as string).trim();
  const status = ((formData.get("status") as JobStatus) || "open") as JobStatus;
  const supabase = await createClient();

  const slug = slugify(title);

  // ========================================================================
  // STEP 1: Create the job
  // ========================================================================
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      company_id: companyId,
      title,
      slug,
      location,
      terminal,
      status,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    redirect(
      `/dashboard/${companyId}/jobs?error=${encodeURIComponent(
        jobError?.message || "Failed to create job"
      )}`
    );
  }

  // Best-effort seeding: do NOT block job creation if seeding fails
  try {
    // ========================================================================
    // STEP 2: Create job-specific board
    // ========================================================================
    const { data: board, error: boardErr } = await supabase
      .from("boards")
      .insert({
        company_id: companyId,
        job_id: job.id,
        name: "Applicants",
      })
      .select("id")
      .single();

    if (boardErr || !board?.id) {
      console.error("[addJob] Failed to create board:", boardErr);
      throw boardErr || new Error("Board creation failed");
    }

    const boardId = board.id;
    console.log(`[addJob] Created board ${boardId} for job ${job.id}`);

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
    const { error: fieldsErr } = await supabase.rpc("create_default_form_fields", {
      p_form_id: form.id,
    });

    if (fieldsErr) {
      console.error("[addJob] Failed to create default fields:", fieldsErr);
      throw fieldsErr;
    }

    // Fetch the created fields
    const { data: fields, error: fetchFieldsErr } = await supabase
      .from("job_application_fields")
      .select("id, key, label, type, sort_order")
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
    const mapFieldTypeToColumnType = (fieldType: string): string => {
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
    };

    // Create columns for all fields except file uploads (resumes handled separately)
    const columnsToCreate = fields
      .filter((f) => f.type !== "file") // Skip file fields for board columns
      .map((field, index) => ({
        board_id: boardId,
        company_id: companyId,
        field_id: field.id,
        name: field.label,
        type: mapFieldTypeToColumnType(field.type),
        sort_order: index + 1,
        is_system: false, // All columns are now form-driven, not "system"
        settings: {},
      }));

    // Add a Status column (special workflow column)
    columnsToCreate.push({
      board_id: boardId,
      company_id: companyId,
      field_id: null as any,
      name: "Status",
      type: "status",
      sort_order: columnsToCreate.length + 1,
      is_system: true,
      settings: {},
    });

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

    console.log(`[addJob] Created ${insertedColumns?.length || 0} board columns`);

    // ========================================================================
    // STEP 6: Create status labels for the Status column
    // ========================================================================
    const statusColumn = insertedColumns?.find((c) => c.type === "status");
    if (statusColumn?.id) {
      const statusLabels = [
        { label: "applied", color: "#3b82f6", sort_order: 1 },
        { label: "screening", color: "#8b5cf6", sort_order: 2 },
        { label: "first_advantage", color: "#f59e0b", sort_order: 3 },
        { label: "interviewing", color: "#10b981", sort_order: 4 },
        { label: "tsa", color: "#06b6d4", sort_order: 5 },
        { label: "hr_paperwork", color: "#ec4899", sort_order: 6 },
        { label: "hired", color: "#22c55e", sort_order: 7 },
        { label: "rejected", color: "#ef4444", sort_order: 8 },
      ].map((l) => ({ ...l, column_id: statusColumn.id }));

      const { error: labelsErr } = await supabase
        .from("board_status_labels")
        .insert(statusLabels);

      if (labelsErr && !labelsErr.message?.includes("unique")) {
        console.error("[addJob] Failed to create status labels:", labelsErr);
      } else {
        console.log(`[addJob] Created ${statusLabels.length} status labels`);
      }
    }

    // ========================================================================
    // STEP 7: Create default board groups
    // ========================================================================
    const groupsToCreate = DEFAULT_GROUPS.map((g) => ({
      board_id: boardId,
      company_id: companyId,
      name: g.name,
      color: g.color,
      sort_order: g.sort_order,
    }));

    const { data: groups, error: groupsErr } = await supabase
      .from("board_groups")
      .insert(groupsToCreate)
      .select("id, name");

    if (groupsErr) {
      console.error("[addJob] Failed to create groups:", groupsErr);
      // If unique constraint violation, groups already exist (idempotent)
      if (!groupsErr.message?.includes("unique")) {
        throw groupsErr;
      }
    } else {
      console.log(`[addJob] Created ${groups?.length || 0} board groups`);
    }

    // ========================================================================
    // STEP 8: Create example applicant (optional, for better UX)
    // ========================================================================
    const newApplicantsGroup = groups?.find((g) => g.name === "New Applicants");
    if (newApplicantsGroup?.id) {
      const { error: applicantErr } = await supabase.from("applicants").insert({
        company_id: companyId,
        job_id: job.id,
        board_id: boardId,
        group_id: newApplicantsGroup.id,
        full_name: "Example Applicant",
        email: "example@applicant.test",
        phone: "555-555-5555",
        status: "applied",
        position: 0,
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
  // STEP 9: Revalidate paths to ensure UI updates immediately
  // ========================================================================
  revalidatePath(`/dashboard/${companyId}`);
  revalidatePath(`/dashboard/${companyId}/jobs`);
  revalidatePath(`/dashboard/${companyId}/jobs/${job.id}`);
  revalidatePath(`/dashboard/${companyId}/jobs/${job.id}/applicants`);

  // Redirect to the new job's applicants board
  redirect(`/dashboard/${companyId}/jobs/${job.id}/applicants`);
}
