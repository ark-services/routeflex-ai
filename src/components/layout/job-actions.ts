"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Helper to verify job access via company membership
async function getJobAuth(companyId: string, jobId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Get company and membership
  const { data: company } = await supabase
    .from("companies")
    .select("account_id")
    .eq("id", companyId)
    .single();
  if (!company) return null;

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();

  // Get job
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .single();

  return { user, company, membership, job };
}

// Rename Job - Admin/Member only
export async function renameJob(companyId: string, jobId: string, newTitle: string) {
  const auth = await getJobAuth(companyId, jobId);
  if (!auth || !auth.membership || auth.membership.role === "viewer") {
    return { error: "Permission denied" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ title: newTitle })
    .eq("id", jobId);

  if (error) {
    console.error("[renameJob] Error:", { message: error.message, code: error.code });
    return { error: "Failed to rename job" };
  }

  console.log(`[renameJob] Renamed job ${jobId} to "${newTitle}"`, {
    userId: auth.user.id,
    companyId,
    timestamp: new Date().toISOString()
  });

  revalidatePath("/", "layout");
  revalidatePath(`/dashboard/${companyId}`);
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  return { success: true };
}

// Duplicate Job - Copies job + board structure + form structure (NOT applicants)
export async function duplicateJob(companyId: string, jobId: string) {
  const auth = await getJobAuth(companyId, jobId);
  if (!auth || !auth.membership || auth.membership.role === "viewer") {
    return { error: "Permission denied" };
  }

  const supabase = await createClient();

  // Create new job with (Copy) suffix, status = "paused"
  const { data: newJob, error: jobError } = await supabase
    .from("jobs")
    .insert({
      company_id: companyId,
      title: `${auth.job.title} (Copy)`,
      description: auth.job.description,
      status: "paused",
      location: auth.job.location,
      employment_type: auth.job.employment_type,
      salary_range: auth.job.salary_range
    })
    .select()
    .single();

  if (jobError || !newJob) {
    console.error("[duplicateJob] Failed to create job:", jobError);
    return { error: "Failed to create job" };
  }

  console.log(`[duplicateJob] Created job copy ${newJob.id}`, {
    userId: auth.user.id,
    originalJobId: jobId,
    companyId,
    timestamp: new Date().toISOString()
  });

  // Copy board structure if exists
  const { data: originalBoard } = await supabase
    .from("boards")
    .select("*")
    .eq("job_id", jobId)
    .single();

  if (originalBoard) {
    const { data: newBoard, error: boardError } = await supabase
      .from("boards")
      .insert({
        job_id: newJob.id,
        company_id: companyId,
        name: originalBoard.name
      })
      .select()
      .single();

    if (!boardError && newBoard) {
      // Copy groups
      const { data: groups } = await supabase
        .from("board_groups")
        .select("*")
        .eq("board_id", originalBoard.id)
        .order("position");

      if (groups) {
        for (const group of groups) {
          await supabase.from("board_groups").insert({
            board_id: newBoard.id,
            name: group.name,
            position: group.position
          });
        }
      }

      // Copy columns
      const { data: columns } = await supabase
        .from("board_columns")
        .select("*")
        .eq("board_id", originalBoard.id)
        .order("position");

      if (columns) {
        for (const column of columns) {
          const { data: newColumn } = await supabase
            .from("board_columns")
            .insert({
              board_id: newBoard.id,
              name: column.name,
              type: column.type,
              position: column.position
            })
            .select()
            .single();

          // Copy status labels for status columns
          if (newColumn && column.type === "status") {
            const { data: statusLabels } = await supabase
              .from("board_status_labels")
              .select("*")
              .eq("column_id", column.id)
              .order("position");

            if (statusLabels) {
              for (const label of statusLabels) {
                await supabase.from("board_status_labels").insert({
                  column_id: newColumn.id,
                  label: label.label,
                  color: label.color,
                  position: label.position
                });
              }
            }
          }
        }
      }

      console.log(`[duplicateJob] Copied board structure to ${newBoard.id}`);
    }
  }

  // Copy application form structure
  const { data: originalForm } = await supabase
    .from("job_application_forms")
    .select("*")
    .eq("job_id", jobId)
    .single();

  if (originalForm) {
    const { data: newForm, error: formError } = await supabase
      .from("job_application_forms")
      .insert({
        job_id: newJob.id
      })
      .select()
      .single();

    if (!formError && newForm) {
      // Copy form fields
      const { data: fields } = await supabase
        .from("job_application_fields")
        .select("*")
        .eq("form_id", originalForm.id)
        .order("position");

      if (fields) {
        for (const field of fields) {
          await supabase.from("job_application_fields").insert({
            form_id: newForm.id,
            label: field.label,
            field_type: field.field_type,
            required: field.required,
            position: field.position,
            options: field.options
          });
        }
      }

      console.log(`[duplicateJob] Copied form structure to ${newForm.id}`);
    }
  }

  revalidatePath("/", "layout");
  revalidatePath(`/dashboard/${companyId}`);
  return { success: true, jobId: newJob.id };
}

// Delete Job - Admin/Member only, cascade deletes applicants/boards/forms
export async function deleteJob(companyId: string, jobId: string) {
  const auth = await getJobAuth(companyId, jobId);
  if (!auth || !auth.membership || auth.membership.role === "viewer") {
    return { error: "Permission denied" };
  }

  const supabase = await createClient();

  // Log counts before delete
  const { count: applicantsCount } = await supabase
    .from("applicants")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  console.log(`[deleteJob] Deleting job ${jobId}`, {
    userId: auth.user.id,
    companyId,
    jobTitle: auth.job.title,
    applicantsCount,
    timestamp: new Date().toISOString()
  });

  // Single delete statement (cascade handles rest)
  const { error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId);

  if (error) {
    console.error("[deleteJob] Error:", { message: error.message, code: error.code });
    return { error: "Failed to delete job" };
  }

  console.log(`[deleteJob] Successfully deleted job ${jobId}`);

  revalidatePath("/", "layout");
  revalidatePath(`/dashboard/${companyId}`);
  return { success: true };
}
