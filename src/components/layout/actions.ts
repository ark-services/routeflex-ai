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

// Default groups to create for new jobs
const DEFAULT_GROUPS = [
  { name: "New Applicants", color: "#0073ea" },
  { name: "Background Check", color: "#00c875" },
  { name: "Interview", color: "#fdab3d" },
  { name: "HR Paperwork", color: "#e2445c" },
  { name: "Hired", color: "#9cd326" },
] as const;

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

  // Ensure Applicants board exists for this company/job
  const boardId = await ensureApplicantsBoard(companyId, job.id);

  // Create default board groups (idempotent)
  await ensureDefaultBoardGroups(companyId, boardId);

  // Create dummy applicant in "New Applicants" group
  await createDummyApplicant(companyId, boardId, job.id);

  return { jobId: job.id };
}

/**
 * Ensures an Applicants board exists for the company/job (idempotent)
 */
async function ensureApplicantsBoard(companyId: string, jobId: string): Promise<string> {
  const supabase = await createClient();

  // Check if board exists
  const { data: existingBoards } = await supabase
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .or('name.eq.Applicants,name.ilike.%Applicants%')
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingBoards && existingBoards.length > 0) {
    return existingBoards[0].id; // Return existing board
  }

  // Create the board
  const { data: newBoard } = await supabase.from("boards").insert({
    company_id: companyId,
    name: "Applicants",
  }).select("id").single();

  return newBoard!.id;
}

/**
 * Ensures default board groups exist for a board (idempotent)
 */
async function ensureDefaultBoardGroups(companyId: string, boardId: string) {
  const supabase = await createClient();

  // Get existing groups for this board
  const { data: existingGroups } = await supabase
    .from("board_groups")
    .select("name")
    .eq("company_id", companyId)
    .eq("board_id", boardId);

  const existingNames = new Set((existingGroups || []).map((g) => g.name));

  // Create missing groups
  const groupsToCreate = DEFAULT_GROUPS.filter(
    (g) => !existingNames.has(g.name)
  );

  if (groupsToCreate.length === 0) {
    return; // All groups already exist
  }

  // Get the highest sort_order
  const { data: lastGroup } = await supabase
    .from("board_groups")
    .select("sort_order")
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .order("sort_order", { ascending: false })
    .limit(1);

  let nextSortOrder = (lastGroup?.[0]?.sort_order ?? -1) + 1;

  // Insert missing groups
  const newGroups = groupsToCreate.map((group) => ({
    company_id: companyId,
    board_id: boardId,
    name: group.name,
    color: group.color,
    sort_order: nextSortOrder++,
  }));

  await supabase.from("board_groups").insert(newGroups);
}

/**
 * Creates a dummy applicant in the "New Applicants" group
 */
async function createDummyApplicant(companyId: string, boardId: string, jobId: string) {
  const supabase = await createClient();

  // Check if this job already has any applicants
  const { data: existingApplicants } = await supabase
    .from("applicants")
    .select("id")
    .eq("job_id", jobId)
    .limit(1);

  if (existingApplicants && existingApplicants.length > 0) {
    return; // Job already has applicants, don't create dummy
  }

  // Find the "New Applicants" group for this board
  const { data: newApplicantsGroup } = await supabase
    .from("board_groups")
    .select("id")
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .eq("name", "New Applicants")
    .single();

  if (!newApplicantsGroup) {
    console.error("New Applicants group not found");
    return;
  }

  // Get the highest position in this group for this job
  const { data: lastApplicant } = await supabase
    .from("applicants")
    .select("position")
    .eq("job_id", jobId)
    .eq("group_id", newApplicantsGroup.id)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (lastApplicant?.[0]?.position ?? -1) + 1;

  // Create dummy applicant
  await supabase.from("applicants").insert({
    company_id: companyId,
    job_id: jobId,
    full_name: "Example Applicant",
    email: "example@applicant.com",
    phone: "555-555-5555",
    status: "New",
    group_id: newApplicantsGroup.id,
    position: nextPosition,
  });
}
