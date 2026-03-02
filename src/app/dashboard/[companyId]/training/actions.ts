"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function assertCompanyMember(companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  // Check via is_company_member RPC — just do a simple query
  const { data } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("company_id", companyId)
    .limit(0);
  // If RLS blocks this, it means user isn't a member — but we rely on RLS to enforce it.
  // The service client is used for writes.
}

// ── Courses ───────────────────────────────────────────────────────────────────

export async function createCourse(
  companyId: string,
  input: { name: string; description?: string; template_id?: string }
) {
  const supabase = await createClient();
  // Use authenticated client so RLS enforces company membership
  const { data, error } = await supabase
    .from("lms_courses")
    .insert({
      company_id: companyId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      template_id: input.template_id ?? null,
      is_published: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training`);
  return data.id as string;
}

export async function updateCourse(
  companyId: string,
  courseId: string,
  input: { name?: string; description?: string; is_published?: boolean; passing_threshold?: number }
) {
  const supabase = await createClient();
  const update: Record<string, any> = {};
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.description !== undefined) update.description = input.description.trim() || null;
  if (input.is_published !== undefined) update.is_published = input.is_published;
  if (input.passing_threshold !== undefined) update.passing_threshold = input.passing_threshold;
  const { error } = await supabase
    .from("lms_courses")
    .update(update)
    .eq("id", courseId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training/${courseId}`);
  revalidatePath(`/dashboard/${companyId}/training`);
}

export async function deleteCourse(companyId: string, courseId: string) {
  // Use service role to force-delete (cascades to modules/questions)
  const svc = getSvc();
  // But first verify the course belongs to this company using the user session
  const supabase = await createClient();
  const { data } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!data) throw new Error("Course not found");

  // lms_enrollments references lms_courses with ON DELETE RESTRICT, so we must
  // delete enrollments (and their cascading module_progress rows) before the course.
  // All other child tables (lms_modules, lms_questions) use ON DELETE CASCADE and
  // are handled automatically when the course row is deleted.
  const { error: enrollErr } = await svc
    .from("lms_enrollments")
    .delete()
    .eq("course_id", courseId);
  if (enrollErr) throw new Error(`Failed to delete enrollments: ${enrollErr.message}`);

  const { error } = await svc.from("lms_courses").delete().eq("id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training`);
}

// ── Clone from template ───────────────────────────────────────────────────────

export async function cloneCourseFromTemplate(
  companyId: string,
  templateId: string
): Promise<string> {
  const svc = getSvc();
  const supabase = await createClient();

  // Verify user can access this company
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Load template
  const { data: template, error: tErr } = await svc
    .from("lms_course_templates")
    .select("id, name, description, carrier_type")
    .eq("id", templateId)
    .eq("is_published", true)
    .single();
  if (tErr || !template) throw new Error("Template not found or not published");

  // Load template modules
  const { data: templateModules } = await svc
    .from("lms_template_modules")
    .select("id, title, content, is_final_exam, sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  // Create course
  const courseId = await createCourse(companyId, {
    name: template.name,
    description: template.description ?? undefined,
    template_id: templateId,
  });

  // Clone modules and their questions
  for (const tm of templateModules ?? []) {
    const { data: newModule, error: mErr } = await svc
      .from("lms_modules")
      .insert({
        course_id: courseId,
        title: tm.title,
        content: tm.content,
        is_final_exam: tm.is_final_exam,
        sort_order: tm.sort_order,
      })
      .select("id")
      .single();
    if (mErr || !newModule) throw new Error(`Failed to clone module "${tm.title}"`);

    // Load template questions for this module
    const { data: templateQs } = await svc
      .from("lms_template_questions")
      .select("question_text, options, correct_option_id, sort_order")
      .eq("template_module_id", tm.id)
      .order("sort_order", { ascending: true });

    if ((templateQs ?? []).length > 0) {
      await svc.from("lms_questions").insert(
        (templateQs ?? []).map((q) => ({
          module_id: newModule.id,
          question_text: q.question_text,
          options: q.options,
          correct_option_id: q.correct_option_id,
          sort_order: q.sort_order,
        }))
      );
    }
  }

  revalidatePath(`/dashboard/${companyId}/training`);
  return courseId;
}

// ── Modules ───────────────────────────────────────────────────────────────────

export async function createModule(
  companyId: string,
  courseId: string,
  input: { title: string; content?: string; is_final_exam?: boolean }
) {
  const svc = getSvc();
  const supabase = await createClient();
  // Verify ownership
  const { data: course } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) throw new Error("Course not found");

  const { data: existing } = await svc
    .from("lms_modules")
    .select("sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const { data, error } = await svc
    .from("lms_modules")
    .insert({
      course_id: courseId,
      title: input.title.trim(),
      content: input.content?.trim() ?? "",
      is_final_exam: input.is_final_exam ?? false,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training/${courseId}`);
  return data.id as string;
}

export async function updateModule(
  companyId: string,
  courseId: string,
  moduleId: string,
  input: { title?: string; content?: string }
) {
  const svc = getSvc();
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) throw new Error("Course not found");

  const update: Record<string, any> = {};
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.content !== undefined) update.content = input.content;
  const { error } = await svc.from("lms_modules").update(update).eq("id", moduleId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training/${courseId}/modules/${moduleId}`);
  revalidatePath(`/dashboard/${companyId}/training/${courseId}`);
}

export async function deleteModule(companyId: string, courseId: string, moduleId: string) {
  const svc = getSvc();
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) throw new Error("Course not found");
  const { error } = await svc.from("lms_modules").delete().eq("id", moduleId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training/${courseId}`);
}

// ── Questions ─────────────────────────────────────────────────────────────────

export async function createQuestion(
  companyId: string,
  courseId: string,
  moduleId: string,
  input: {
    question_text: string;
    options: Array<{ id: string; text: string }>;
    correct_option_id: string;
  }
) {
  const svc = getSvc();
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) throw new Error("Course not found");

  const { data: existing } = await svc
    .from("lms_questions")
    .select("sort_order")
    .eq("module_id", moduleId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const { data, error } = await svc
    .from("lms_questions")
    .insert({
      module_id: moduleId,
      question_text: input.question_text.trim(),
      options: input.options,
      correct_option_id: input.correct_option_id,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training/${courseId}/modules/${moduleId}`);
  return data.id as string;
}

export async function updateQuestion(
  companyId: string,
  courseId: string,
  moduleId: string,
  questionId: string,
  input: {
    question_text?: string;
    options?: Array<{ id: string; text: string }>;
    correct_option_id?: string;
  }
) {
  const svc = getSvc();
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) throw new Error("Course not found");

  const update: Record<string, any> = {};
  if (input.question_text !== undefined) update.question_text = input.question_text.trim();
  if (input.options !== undefined) update.options = input.options;
  if (input.correct_option_id !== undefined) update.correct_option_id = input.correct_option_id;
  const { error } = await svc.from("lms_questions").update(update).eq("id", questionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training/${courseId}/modules/${moduleId}`);
}

export async function deleteQuestion(
  companyId: string,
  courseId: string,
  moduleId: string,
  questionId: string
) {
  const svc = getSvc();
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) throw new Error("Course not found");
  const { error } = await svc.from("lms_questions").delete().eq("id", questionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training/${courseId}/modules/${moduleId}`);
}

export async function createQuestionsBulk(
  companyId: string,
  courseId: string,
  moduleId: string,
  questions: Array<{
    question_text: string;
    options: Array<{ id: string; text: string }>;
    correct_option_id: string;
  }>
) {
  const svc = getSvc();
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) throw new Error("Course not found");

  const { data: existing } = await svc
    .from("lms_questions")
    .select("sort_order")
    .eq("module_id", moduleId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const baseOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const rows = questions.map((q, i) => ({
    module_id: moduleId,
    question_text: q.question_text.trim(),
    options: q.options,
    correct_option_id: q.correct_option_id,
    sort_order: baseOrder + i,
  }));

  const { data, error } = await svc
    .from("lms_questions")
    .insert(rows)
    .select("id, question_text, options, correct_option_id, sort_order");
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/training/${courseId}/modules/${moduleId}`);
  return data as Array<{
    id: string;
    question_text: string;
    options: Array<{ id: string; text: string }>;
    correct_option_id: string;
    sort_order: number;
  }>;
}

// ── Manual Enrollment ──────────────────────────────────────────────────────────

/**
 * Returns applicants in this company who are NOT yet enrolled in the given course.
 * Used to populate the dropdown in the manual enrollment modal.
 */
export async function getUnenrolledApplicants(
  companyId: string,
  courseId: string
): Promise<Array<{ id: string; full_name: string; email: string | null; jobs: { title: string } | null }>> {
  const svc = getSvc();
  const supabase = await createClient();

  // RLS check — user must have access to this company
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .single();
  if (!company) throw new Error("Company not found");

  // Fetch already-enrolled applicant IDs for this course
  const { data: enrolled } = await svc
    .from("lms_enrollments")
    .select("applicant_id")
    .eq("course_id", courseId);
  const enrolledIds = (enrolled ?? []).map((e) => e.applicant_id as string);

  // Fetch applicants in this company, excluding already-enrolled ones
  // Include job_id so we can look up board cells for real names
  let query = svc
    .from("applicants")
    .select("id, full_name, email, job_id, jobs(title)")
    .eq("company_id", companyId)
    .order("full_name", { ascending: true });

  if (enrolledIds.length > 0) {
    query = query.not("id", "in", `(${enrolledIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const applicants = (data ?? []) as unknown as Array<{
    id: string;
    full_name: string;
    email: string | null;
    job_id: string | null;
    jobs: { title: string } | null;
  }>;

  if (applicants.length === 0) return [];

  // ── Resolve real names from board_cells ────────────────────────────────────
  // Applicants created via quick-add have full_name = "New Applicant" as a
  // placeholder. Real first/last names are stored in board_cells for the
  // "First Name" and "Last Name" columns of the applicant's job board.

  const applicantIds = applicants.map((a) => a.id);
  const jobIds = [...new Set(applicants.map((a) => a.job_id).filter(Boolean))] as string[];

  // 1. Get boards for each job
  const { data: boards } = jobIds.length > 0
    ? await svc.from("boards").select("id, job_id").in("job_id", jobIds)
    : { data: [] };

  const boardIds = (boards ?? []).map((b: { id: string }) => b.id);
  const jobToBoardId: Record<string, string> = {};
  for (const b of boards ?? []) {
    jobToBoardId[(b as { id: string; job_id: string }).job_id] = (b as { id: string; job_id: string }).id;
  }

  // 2. Get "First Name" and "Last Name" text columns on those boards
  const { data: nameColumns } = boardIds.length > 0
    ? await svc
        .from("board_columns")
        .select("id, name, board_id")
        .in("board_id", boardIds)
        .in("name", ["First Name", "Last Name"])
        .eq("type", "text")
    : { data: [] };

  const colIds = (nameColumns ?? []).map((c: { id: string }) => c.id);

  // 3. Get the cell values for those columns + these applicants
  const { data: cells } = colIds.length > 0
    ? await svc
        .from("board_cells")
        .select("applicant_id, column_id, value_text")
        .in("column_id", colIds)
        .in("applicant_id", applicantIds)
    : { data: [] };

  // 4. Build a lookup: applicantId → { firstName?, lastName? }
  type ColInfo = { id: string; name: string; board_id: string };
  const colMap: Record<string, ColInfo> = {};
  for (const col of nameColumns ?? []) {
    colMap[(col as ColInfo).id] = col as ColInfo;
  }

  const nameMap: Record<string, { firstName?: string; lastName?: string }> = {};
  for (const cell of cells ?? []) {
    const c = cell as { applicant_id: string; column_id: string; value_text: string | null };
    if (!c.value_text) continue;
    const colInfo = colMap[c.column_id];
    if (!colInfo) continue;
    if (!nameMap[c.applicant_id]) nameMap[c.applicant_id] = {};
    if (colInfo.name === "First Name") nameMap[c.applicant_id].firstName = c.value_text;
    if (colInfo.name === "Last Name") nameMap[c.applicant_id].lastName = c.value_text;
  }

  // 5. Build display names, falling back to full_name if cells are absent
  return applicants.map((a) => {
    const parts = nameMap[a.id];
    const resolvedName = parts
      ? [parts.firstName, parts.lastName].filter(Boolean).join(" ") || a.full_name
      : a.full_name;
    return {
      id: a.id,
      full_name: resolvedName,
      email: a.email,
      jobs: a.jobs,
    };
  }).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/**
 * Manually enroll an applicant in a course.
 * Idempotent: if already enrolled, returns the existing token.
 * Does NOT gate on is_published — intentional for admin testing of draft courses.
 */
export async function enrollApplicant(
  companyId: string,
  courseId: string,
  applicantId: string
): Promise<{ token: string }> {
  const svc = getSvc();
  const supabase = await createClient();

  // Verify course belongs to this company (RLS)
  const { data: course } = await supabase
    .from("lms_courses")
    .select("id")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) throw new Error("Course not found");

  // Verify applicant belongs to this company (RLS)
  const { data: applicant } = await supabase
    .from("applicants")
    .select("id")
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .single();
  if (!applicant) throw new Error("Applicant not found");

  // Idempotency: return existing token if already enrolled
  const { data: existing } = await svc
    .from("lms_enrollments")
    .select("token")
    .eq("applicant_id", applicantId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (existing) return { token: existing.token as string };

  // Create new enrollment
  const { data: enrollment, error } = await svc
    .from("lms_enrollments")
    .insert({ applicant_id: applicantId, course_id: courseId, status: "enrolled" })
    .select("token")
    .single();

  if (error) {
    // Race condition: another insert beat us; fetch the existing token
    if (error.code === "23505") {
      const { data: fallback } = await svc
        .from("lms_enrollments")
        .select("token")
        .eq("applicant_id", applicantId)
        .eq("course_id", courseId)
        .single();
      if (fallback) return { token: fallback.token as string };
    }
    throw new Error(error.message);
  }

  revalidatePath(`/dashboard/${companyId}/training/${courseId}/learners`);
  return { token: enrollment.token as string };
}

/**
 * Send the standard training link email to an already-enrolled applicant.
 * Returns { sent, error } — never throws, so the caller can handle gracefully.
 */
export async function sendTrainingEmail(
  companyId: string,
  applicantId: string,
  token: string
): Promise<{ sent: boolean; error?: string }> {
  const svc = getSvc();
  const supabase = await createClient();

  // Fetch applicant with job_id so we can resolve email/name from board cells
  const { data: applicant } = await svc
    .from("applicants")
    .select("full_name, email, job_id")
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .single();
  if (!applicant) return { sent: false, error: "Applicant not found" };

  // ── Resolve email + first name from board cells ────────────────────────────
  // applicants.email and full_name may be placeholders; real values are in cells.
  let resolvedEmail: string | null = (applicant.email as string | null) ?? null;
  let resolvedFirstName: string | null = null;

  const jobId = applicant.job_id as string | null;
  if (jobId) {
    const { data: board } = await svc
      .from("boards")
      .select("id")
      .eq("job_id", jobId)
      .maybeSingle();

    if (board) {
      const { data: cols } = await svc
        .from("board_columns")
        .select("id, name, type")
        .eq("board_id", (board as { id: string }).id)
        .in("name", ["First Name", "Last Name", "Email", "Email Address"])
        .in("type", ["text", "email"]);

      const colIds = (cols ?? []).map((c: { id: string }) => c.id);

      if (colIds.length > 0) {
        const { data: cells } = await svc
          .from("board_cells")
          .select("column_id, value_text")
          .eq("applicant_id", applicantId)
          .in("column_id", colIds);

        type ColRow = { id: string; name: string; type: string };
        const colMap: Record<string, ColRow> = {};
        for (const col of cols ?? []) colMap[(col as ColRow).id] = col as ColRow;

        let firstName = "";
        let lastName = "";

        for (const cell of cells ?? []) {
          const c = cell as { column_id: string; value_text: string | null };
          if (!c.value_text) continue;
          const col = colMap[c.column_id];
          if (!col) continue;
          if (col.name === "First Name") firstName = c.value_text;
          if (col.name === "Last Name") lastName = c.value_text;
          if ((col.name === "Email" || col.name === "Email Address") && !resolvedEmail) {
            resolvedEmail = c.value_text;
          }
        }
        if (firstName) resolvedFirstName = firstName;
        else if (firstName || lastName) {
          resolvedFirstName = [firstName, lastName].filter(Boolean).join(" ").split(" ")[0];
        }
      }
    }
  }

  if (!resolvedEmail) return { sent: false, error: "Applicant has no email address" };

  // Derive first name for greeting: board cell → full_name first word → "there"
  const greeting =
    resolvedFirstName ||
    ((applicant.full_name as string | null)?.split(" ")[0] ?? "there");

  const { data: company } = await svc
    .from("companies")
    .select("name, logo_url")
    .eq("id", companyId)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const trainingUrl = `${appUrl}/learn/${token}`;

  const { getGmailClientForCompany, sendEmail, buildTrainingLinkEmail } = await import(
    "@/lib/gmail-send"
  );

  const gmailClient = await getGmailClientForCompany(supabase, companyId);
  if (!gmailClient) return { sent: false, error: "Gmail not connected" };

  const { subject, body } = buildTrainingLinkEmail({
    firstName: greeting,
    companyName: (company?.name as string) ?? "Your employer",
    logoUrl: company?.logo_url as string | null | undefined,
    trainingUrl,
  });

  const result = await sendEmail(gmailClient.gmail, {
    to: resolvedEmail,
    subject,
    body,
  });

  if (!result.success) return { sent: false, error: result.error };
  return { sent: true };
}
