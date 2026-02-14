"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createCompany(formData: FormData) {
  console.log("[createCompany] Starting company creation...");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("[createCompany] User not authenticated");
    return { error: "Not authenticated" };
  }

  const name = formData.get("name") as string;
  const accountId = formData.get("accountId") as string;

  console.log("[createCompany] Creating company:", { name, accountId });

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

  if (!membership || (membership.role !== "admin" && membership.role !== "owner")) {
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
    console.error("[createCompany] Error creating company:", companyError);
    return { error: "Failed to create company" };
  }

  console.log("[createCompany] Company created successfully:", company.id);

  // Revalidate dashboard paths to ensure the UI updates
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${company.id}`);
  console.log("[createCompany] Revalidated paths: /dashboard and /dashboard/" + company.id);

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
  console.log("[createJob] Starting job creation...");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("[createJob] User not authenticated");
    return { error: "Not authenticated" };
  }

  const title = formData.get("title") as string;
  const location = formData.get("location") as string;
  const terminal = formData.get("terminal") as string;
  const companyId = formData.get("companyId") as string;

  console.log("[createJob] Creating job:", { title, location, terminal, companyId });

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
    console.error("[createJob] Error creating job:", jobError);
    return { error: "Failed to create job" };
  }

  console.log("[createJob] Job created successfully:", job.id);

  // Initialize boards/groups/applicants (non-blocking - failures are logged but don't prevent job creation)
  try {
    console.log("[createJob] Setting up boards and groups...");

    // Ensure Applicants board exists for this company/job
    const boardId = await ensureApplicantsBoard(companyId, job.id);
    console.log("[createJob] Board ID:", boardId);

    // Create default board groups (idempotent)
    await ensureDefaultBoardGroups(companyId, boardId);
    console.log("[createJob] Default board groups created");

    // Create dummy applicant in "New Applicants" group
    await createDummyApplicant(companyId, boardId, job.id);
    console.log("[createJob] Dummy applicant created");
  } catch (setupError) {
    // Log the error but don't fail the job creation
    console.error("[createJob] Non-fatal error setting up boards/groups:", setupError);
    console.warn("[createJob] Job was created successfully, but board setup had issues");
  }

  // Revalidate paths to ensure the UI updates immediately
  revalidatePath(`/dashboard/${companyId}`);
  revalidatePath(`/dashboard/${companyId}/jobs/${job.id}`);
  revalidatePath(`/dashboard/${companyId}/jobs/${job.id}/applicants`);
  console.log("[createJob] Revalidated paths for company:", companyId, "and job:", job.id);

  return { jobId: job.id };
}

/**
 * Ensures an Applicants board exists for the company/job (idempotent)
 */
async function ensureApplicantsBoard(companyId: string, jobId: string): Promise<string> {
  const supabase = await createClient();

  // Prefer job-scoped boards if the schema supports it.
  // Some earlier schemas may not have boards.job_id; in that case we fall back to company-scoped Applicants.

  // Attempt 1: job-scoped lookup
  {
    const res = await supabase
      .from("boards")
      .select("id")
      .eq("company_id", companyId)
      .eq("job_id", jobId)
      .eq("name", "Applicants")
      .limit(1);

    if (!res.error && res.data && res.data.length > 0) {
      return res.data[0].id;
    }

    // If the column doesn't exist, fall through to legacy behavior
    if (
      res.error &&
      typeof res.error.message === "string" &&
      res.error.message.toLowerCase().includes('column "job_id"')
    ) {
      // legacy mode
    } else if (res.error) {
      console.error("ensureApplicantsBoard: job-scoped lookup failed:", res.error);
    }
  }

  // Attempt 2: legacy company-scoped lookup
  const { data: existingBoards, error: legacyErr } = await supabase
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", "Applicants")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!legacyErr && existingBoards && existingBoards.length > 0) {
    return existingBoards[0].id;
  }

  if (legacyErr) {
    console.error("ensureApplicantsBoard: legacy lookup failed:", legacyErr);
  }

  // Create the board. Try job-scoped insert first; fall back if boards.job_id doesn't exist.
  {
    const res1 = await supabase
      .from("boards")
      .insert({
        company_id: companyId,
        job_id: jobId,
        name: "Applicants",
      } as any)
      .select("id")
      .single();

    if (!res1.error && res1.data?.id) {
      return res1.data.id;
    }

    if (
      res1.error &&
      typeof res1.error.message === "string" &&
      res1.error.message.toLowerCase().includes('column "job_id"')
    ) {
      const res2 = await supabase
        .from("boards")
        .insert({
          company_id: companyId,
          name: "Applicants",
        })
        .select("id")
        .single();

      if (res2.error || !res2.data?.id) {
        console.error("ensureApplicantsBoard: failed to create board:", res2.error);
        throw new Error(res2.error?.message || "Failed to create Applicants board");
      }

      return res2.data.id;
    }

    console.error("ensureApplicantsBoard: failed to create board:", res1.error);
    throw new Error(res1.error?.message || "Failed to create Applicants board");
  }
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
  const insertPayloadWithBoard = {
    company_id: companyId,
    job_id: jobId,
    board_id: boardId,
    full_name: "Example Applicant",
    email: "example@applicant.com",
    phone: "555-555-5555",
    status: "applied",
    group_id: newApplicantsGroup.id,
    position: nextPosition,
  };

  const insertPayloadLegacy = {
    company_id: companyId,
    job_id: jobId,
    full_name: "Example Applicant",
    email: "example@applicant.com",
    phone: "555-555-5555",
    status: "applied",
    group_id: newApplicantsGroup.id,
    position: nextPosition,
  };

  const res1 = await supabase.from("applicants").insert(insertPayloadWithBoard as any);
  if (
    res1.error &&
    typeof res1.error.message === "string" &&
    res1.error.message.toLowerCase().includes('column "board_id"')
  ) {
    const res2 = await supabase.from("applicants").insert(insertPayloadLegacy as any);
    if (res2.error) {
      console.error("Failed to create dummy applicant:", res2.error);
    }
  } else if (res1.error) {
    console.error("Failed to create dummy applicant:", res1.error);
  }
}
