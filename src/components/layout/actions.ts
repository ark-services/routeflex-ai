"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function createCompany(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const name = formData.get("name") as string;
  const accountId = formData.get("accountId") as string;

  if (!name || !accountId) {
    return { error: "Name and account ID are required" };
  }

  // Check if user is admin of the account
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    return { error: "Only admins can create companies" };
  }

  // Create slug from name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Create company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({
      name,
      slug,
      account_id: accountId,
    })
    .select()
    .single();

  if (companyError) {
    console.error("Error creating company:", companyError);
    return { error: "Failed to create company" };
  }

  return { companyId: company.id };
}

export async function createJob(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const title = formData.get("title") as string;
  const location = formData.get("location") as string;
  const terminal = formData.get("terminal") as string;
  const companyId = formData.get("companyId") as string;

  if (!title || !companyId) {
    return { error: "Title and company ID are required" };
  }

  // Check if user has access to this company
  const { data: company } = await supabase
    .from("companies")
    .select("account_id")
    .eq("id", companyId)
    .single();

  if (!company) {
    return { error: "Company not found" };
  }

  // Check user role in the account
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return { error: "No access to this company" };
  }

  // Viewers cannot create jobs
  if (membership.role === "viewer") {
    return { error: "Viewers cannot create jobs" };
  }

  // Create slug from title
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Create job
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      company_id: companyId,
      title,
      slug,
      location: location || "",
      terminal: terminal || "",
      status: "open",
    })
    .select()
    .single();

  if (jobError) {
    console.error("Error creating job:", jobError);
    return { error: "Failed to create job" };
  }

  return { jobId: job.id };
}
