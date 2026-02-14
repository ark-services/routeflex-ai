"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "@/lib/types";
import { PostgrestError } from "@supabase/supabase-js";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function addJob(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const title = (formData.get("title") as string).trim();
  const location = (formData.get("location") as string).trim();
  const terminal = (formData.get("terminal") as string).trim();
  const status = ((formData.get("status") as JobStatus) || "open") as JobStatus;
  const supabase = await createClient();

  const slug = slugify(title);

  // 1) Create the job and get its ID
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

  // Best-effort seeding: do NOT block job creation if seeding fails.
  // This prevents the UX issue where the job exists but the UI errors.
  try {
    type InsertResult<T> = { data: T | null; error: PostgrestError | null };

    const insertWithFallback = async <T extends Record<string, any>>(
      table: string,
      primary: Record<string, any>,
      fallback?: Record<string, any>,
      select?: string
    ): Promise<InsertResult<T>> => {
      const q = supabase.from(table).insert(primary);
      const primaryRes = (select
        ? await q.select(select).single()
        : await q) as any;

      if (!primaryRes.error) return primaryRes;

      // If we have fallback data, retry once (useful when a column doesn't exist).
      if (fallback) {
        const q2 = supabase.from(table).insert(fallback);
        const fallbackRes = (select
          ? await q2.select(select).single()
          : await q2) as any;
        return fallbackRes;
      }

      return primaryRes;
    };

    // 2) Create an Applicants board for this job
    const boardName = `${title} Applicants`;

    const { data: board, error: boardErr } = await insertWithFallback<{
      id: string;
    }>(
      "boards",
      { company_id: companyId, name: boardName, job_id: job.id },
      { company_id: companyId, name: boardName },
      "id"
    );

    if (boardErr || !board?.id) {
      console.error("Failed to seed board:", boardErr);
      // Stop seeding further if we can't make a board
      throw boardErr || new Error("Board insert failed");
    }

    const boardId = board.id;

    // 3) Create default board columns (keep minimal assumptions about schema)
    // We create a status column and a couple of basic columns.
    const columnsPayload = [
      {
        board_id: boardId,
        company_id: companyId,
        is_system: true,
        name: "Name",
        type: "text",
        settings: {},
        sort_order: 1,
      },
      {
        board_id: boardId,
        company_id: companyId,
        is_system: true,
        name: "Email",
        type: "email",
        settings: {},
        sort_order: 2,
      },
      {
        board_id: boardId,
        company_id: companyId,
        is_system: true,
        name: "Phone",
        type: "phone",
        settings: {},
        sort_order: 3,
      },
      {
        board_id: boardId,
        company_id: companyId,
        is_system: true,
        name: "Status",
        type: "status",
        settings: {},
        sort_order: 4,
      },
    ];

    // Try with company_id first; if schema differs, retry without company_id.
    const { data: insertedColumns, error: colsErr } = await (async () => {
      const res1 = await supabase
        .from("board_columns")
        .insert(columnsPayload)
        .select("id,name,type")
        .returns<any[]>();

      if (!res1.error) return res1 as any;

      const payloadNoCompany = columnsPayload.map(({ company_id, ...rest }) => rest);
      const res2 = await supabase
        .from("board_columns")
        .insert(payloadNoCompany)
        .select("id,name,type")
        .returns<any[]>();

      return res2 as any;
    })();

    if (colsErr) {
      console.error("Failed to seed columns:", colsErr);
      throw colsErr;
    }

    const statusColumn = (insertedColumns || []).find(
      (c: any) => String(c.type).toLowerCase() === "status" || String(c.name).toLowerCase() === "status"
    );

    // 4) Seed status labels that match your applicants_status_check constraint
    // Allowed statuses:
    // applied, screening, first_advantage, interviewing, tsa, hr_paperwork, hired, rejected
    if (statusColumn?.id) {
      const statusLabels = [
        { label: "Applied", color: "gray", sort_order: 1 },
        { label: "Screening", color: "blue", sort_order: 2 },
        { label: "First Advantage", color: "purple", sort_order: 3 },
        { label: "Interviewing", color: "yellow", sort_order: 4 },
        { label: "TSA", color: "orange", sort_order: 5 },
        { label: "HR Paperwork", color: "cyan", sort_order: 6 },
        { label: "Hired", color: "green", sort_order: 7 },
        { label: "Rejected", color: "red", sort_order: 8 },
      ].map((l) => ({ ...l, column_id: statusColumn.id }));

      const { error: labelsErr } = await supabase
        .from("board_status_labels")
        .insert(statusLabels);

      if (labelsErr) {
        console.error("Failed to seed status labels:", labelsErr);
        // Don't throw; labels are helpful but not required to proceed.
      }
    }

    // 5) Create default groups for THIS board (per-job)
    const defaultGroups = [
      { name: "New Applicants", color: "green", sort_order: 1 },
      { name: "Background Check", color: "purple", sort_order: 2 },
      { name: "Interview", color: "yellow", sort_order: 3 },
      { name: "HR Paperwork", color: "cyan", sort_order: 4 },
      { name: "Hired", color: "green", sort_order: 5 },
    ].map((g) => ({
      board_id: boardId,
      company_id: companyId,
      name: g.name,
      color: g.color,
      sort_order: g.sort_order,
    }));

    const { data: groups, error: groupsErr } = await (async () => {
      const res1 = await supabase
        .from("board_groups")
        .insert(defaultGroups)
        .select("id,name")
        .returns<any[]>();
      if (!res1.error) return res1 as any;

      const payloadNoCompany = defaultGroups.map(({ company_id, ...rest }) => rest);
      const res2 = await supabase
        .from("board_groups")
        .insert(payloadNoCompany)
        .select("id,name")
        .returns<any[]>();
      return res2 as any;
    })();

    if (groupsErr) {
      console.error("Failed to seed default groups:", groupsErr);
      // Don't throw; groups can be created later in UI.
    }

    // 6) Insert a single dummy applicant in New Applicants so the board isn't empty
    const newApplicantsGroup = (groups || []).find(
      (g: any) => String(g.name).toLowerCase() === "new applicants"
    );

    if (newApplicantsGroup?.id) {
      const dummyApplicant = {
        company_id: companyId,
        job_id: job.id,
        group_id: newApplicantsGroup.id,
        full_name: "Example Applicant (delete me)",
        email: "example@applicant.test",
        phone: "555-555-5555",
        position: 1,
        // IMPORTANT: Must match applicants_status_check
        status: "applied",
      };

      const { error: applicantErr } = await supabase
        .from("applicants")
        .insert(dummyApplicant);

      if (applicantErr) {
        console.error("Failed to seed dummy applicant:", applicantErr);
        // Don't throw; not required.
      }
    }
  } catch (e) {
    console.error("Job created but seeding failed:", e);
  }

  revalidatePath(`/dashboard/${companyId}/jobs`);
  // Also revalidate the main dashboard path so the sidebar picks up the new job without refresh.
  revalidatePath(`/dashboard/${companyId}`);
}
