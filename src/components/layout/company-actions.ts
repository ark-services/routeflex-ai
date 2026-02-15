"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Helper to get company membership and verify access
async function getCompanyAuth(companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: company } = await supabase
    .from("companies")
    .select("name, account_id")
    .eq("id", companyId)
    .single();
  if (!company) return null;

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();

  return { user, company, membership };
}

// Rename Company - Admin/Member only
export async function renameCompany(companyId: string, newName: string) {
  const auth = await getCompanyAuth(companyId);
  if (!auth || !auth.membership || auth.membership.role === "viewer") {
    return { error: "Permission denied" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ name: newName })
    .eq("id", companyId);

  if (error) {
    console.error("[renameCompany] Error:", { message: error.message, code: error.code });
    return { error: "Failed to rename company" };
  }

  console.log(`[renameCompany] Renamed company ${companyId} to "${newName}"`, {
    userId: auth.user.id,
    timestamp: new Date().toISOString()
  });

  revalidatePath("/", "layout");
  revalidatePath(`/dashboard/${companyId}`);
  return { success: true };
}

// Duplicate Company - Admin/Member only, optionally include jobs (structure only)
export async function duplicateCompany(companyId: string, includeJobs: boolean = false) {
  const auth = await getCompanyAuth(companyId);
  if (!auth || !auth.membership || auth.membership.role === "viewer") {
    return { error: "Permission denied" };
  }

  const supabase = await createClient();

  // Get original company
  const { data: originalCompany, error: fetchError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (fetchError || !originalCompany) {
    console.error("[duplicateCompany] Failed to fetch company:", fetchError);
    return { error: "Failed to fetch company" };
  }

  // Create new company with (Copy) suffix
  const { data: newCompany, error: createError } = await supabase
    .from("companies")
    .insert({
      name: `${originalCompany.name} (Copy)`,
      account_id: originalCompany.account_id,
      slug: `${originalCompany.slug}-copy-${Date.now()}`
    })
    .select()
    .single();

  if (createError || !newCompany) {
    console.error("[duplicateCompany] Failed to create company:", createError);
    return { error: "Failed to create company" };
  }

  console.log(`[duplicateCompany] Created company copy ${newCompany.id}`, {
    userId: auth.user.id,
    originalCompanyId: companyId,
    includeJobs,
    timestamp: new Date().toISOString()
  });

  // If includeJobs, copy job structure (not applicants)
  if (includeJobs) {
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("company_id", companyId);

    if (!jobsError && jobs) {
      for (const job of jobs) {
        const { data: newJob, error: jobCreateError } = await supabase
          .from("jobs")
          .insert({
            company_id: newCompany.id,
            title: job.title,
            description: job.description,
            status: "paused", // Start paused
            location: job.location,
            employment_type: job.employment_type,
            salary_range: job.salary_range
          })
          .select()
          .single();

        if (jobCreateError) {
          console.error("[duplicateCompany] Failed to copy job:", jobCreateError);
          continue;
        }

        console.log(`[duplicateCompany] Copied job ${job.id} -> ${newJob.id}`);
      }
    }
  }

  revalidatePath("/", "layout");
  revalidatePath(`/dashboard/${newCompany.id}`);
  return { success: true, companyId: newCompany.id };
}

// Delete Company - Admin only (stricter), cascade deletes all related data
export async function deleteCompany(companyId: string) {
  const auth = await getCompanyAuth(companyId);
  if (!auth || !auth.membership) {
    return { error: "Permission denied" };
  }

  // Only admins can delete companies
  if (auth.membership.role !== "admin") {
    return { error: "Only admins can delete companies" };
  }

  const supabase = await createClient();

  // Log counts before delete
  const { count: jobsCount } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  const { count: applicantsCount } = await supabase
    .from("applicants")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  console.log(`[deleteCompany] Deleting company ${companyId}`, {
    userId: auth.user.id,
    companyName: auth.company.name,
    jobsCount,
    applicantsCount,
    timestamp: new Date().toISOString()
  });

  // Single delete statement (cascade handles rest)
  const { error } = await supabase
    .from("companies")
    .delete()
    .eq("id", companyId);

  if (error) {
    console.error("[deleteCompany] Error:", { message: error.message, code: error.code });
    return { error: "Failed to delete company" };
  }

  console.log(`[deleteCompany] Successfully deleted company ${companyId}`);

  revalidatePath("/", "layout");
  return { success: true };
}
