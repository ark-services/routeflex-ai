import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Lock } from "lucide-react";
import { EnrollModalTrigger } from "./EnrollModal";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function LearnersPage({
  params,
}: {
  params: Promise<{ companyId: string; courseId: string }>;
}) {
  const { companyId, courseId } = await params;
  const supabase = await createClient();
  const svc = getSvc();

  const { data: company } = await supabase
    .from("companies")
    .select("id, lms_enabled")
    .eq("id", companyId)
    .single();
  if (!company?.lms_enabled) redirect(`/dashboard/${companyId}/training`);

  const { data: course } = await supabase
    .from("lms_courses")
    .select("id, name, passing_threshold")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) notFound();

  // Check if Gmail is connected (determines button label in the enroll modal)
  const { data: gmailConn } = await supabase
    .from("gmail_connections")
    .select("id")
    .eq("company_id", companyId)
    .is("revoked_at", null)
    .maybeSingle();
  const hasGmail = !!gmailConn;

  // Load modules for this course (ordered)
  const { data: modules } = await svc
    .from("lms_modules")
    .select("id, title, is_final_exam, sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  const regularModules = (modules ?? []).filter((m) => !m.is_final_exam);
  const finalExam = (modules ?? []).find((m) => m.is_final_exam);

  // Load enrollments for this course with applicant info (include job_id for name resolution)
  const { data: enrollments } = await svc
    .from("lms_enrollments")
    .select(`
      id,
      status,
      enrolled_at,
      completed_at,
      token,
      applicant_id,
      applicants (
        id,
        full_name,
        email,
        job_id
      )
    `)
    .eq("course_id", courseId)
    .order("enrolled_at", { ascending: false });

  // ── Resolve real names + emails from board cells ───────────────────────────
  // applicants.full_name / .email may be placeholders; real values are in cells.
  const applicantDisplayMap: Record<string, { name: string; email: string }> = {};

  const rawApplicants = (enrollments ?? []).map((e) => (e as any).applicants).filter(Boolean);
  if (rawApplicants.length > 0) {
    const applicantIds = rawApplicants.map((a: any) => a.id as string);
    const jobIds = [...new Set(rawApplicants.map((a: any) => a.job_id as string | null).filter(Boolean))] as string[];

    const { data: boards } = jobIds.length > 0
      ? await svc.from("boards").select("id, job_id").in("job_id", jobIds)
      : { data: [] };

    const boardIds = (boards ?? []).map((b: any) => b.id as string);
    const jobToBoardId: Record<string, string> = {};
    for (const b of boards ?? []) jobToBoardId[(b as any).job_id] = (b as any).id;

    const { data: nameEmailCols } = boardIds.length > 0
      ? await svc
          .from("board_columns")
          .select("id, name, board_id")
          .in("board_id", boardIds)
          .in("name", ["First Name", "Last Name", "Email", "Email Address"])
          .in("type", ["text", "email"])
      : { data: [] };

    const colIds = (nameEmailCols ?? []).map((c: any) => c.id as string);
    const { data: cells } = colIds.length > 0
      ? await svc
          .from("board_cells")
          .select("applicant_id, column_id, value_text")
          .in("column_id", colIds)
          .in("applicant_id", applicantIds)
      : { data: [] };

    const colMap: Record<string, { name: string }> = {};
    for (const col of nameEmailCols ?? []) colMap[(col as any).id] = col as any;

    const cellData: Record<string, { firstName?: string; lastName?: string; email?: string }> = {};
    for (const cell of cells ?? []) {
      const c = cell as { applicant_id: string; column_id: string; value_text: string | null };
      if (!c.value_text) continue;
      const col = colMap[c.column_id];
      if (!col) continue;
      if (!cellData[c.applicant_id]) cellData[c.applicant_id] = {};
      if (col.name === "First Name") cellData[c.applicant_id].firstName = c.value_text;
      if (col.name === "Last Name") cellData[c.applicant_id].lastName = c.value_text;
      if ((col.name === "Email" || col.name === "Email Address") && !cellData[c.applicant_id].email) {
        cellData[c.applicant_id].email = c.value_text;
      }
    }

    for (const a of rawApplicants) {
      const parts = cellData[a.id];
      const resolvedName = parts?.firstName
        ? [parts.firstName, parts.lastName].filter(Boolean).join(" ")
        : (a.full_name as string) || "Unknown";
      const resolvedEmail = parts?.email ?? (a.email as string | null) ?? "";
      applicantDisplayMap[a.id] = { name: resolvedName, email: resolvedEmail };
    }
  }

  // Load all module attempts for these enrollments
  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  let attempts: any[] = [];
  if (enrollmentIds.length > 0) {
    const { data } = await svc
      .from("lms_module_attempts")
      .select("id, enrollment_id, module_id, score, passed, completed_at")
      .in("enrollment_id", enrollmentIds)
      .order("completed_at", { ascending: false });
    attempts = data ?? [];
  }

  // Build a map: enrollmentId → moduleId → best attempt
  const bestAttempts: Record<string, Record<string, { score: number; passed: boolean }>> = {};
  for (const attempt of attempts) {
    if (!bestAttempts[attempt.enrollment_id]) {
      bestAttempts[attempt.enrollment_id] = {};
    }
    const existing = bestAttempts[attempt.enrollment_id][attempt.module_id];
    // Keep the best (highest score) attempt
    if (!existing || attempt.score > existing.score) {
      bestAttempts[attempt.enrollment_id][attempt.module_id] = {
        score: attempt.score,
        passed: attempt.passed,
      };
    }
  }

  const allModules = [...regularModules, ...(finalExam ? [finalExam] : [])];

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-stone-500 mb-6">
          <Link href={`/dashboard/${companyId}/training`} className="hover:text-stone-700 transition-colors">
            Training
          </Link>
          <span>/</span>
          <Link href={`/dashboard/${companyId}/training/${courseId}`} className="hover:text-stone-700 transition-colors">
            {course.name}
          </Link>
          <span>/</span>
          <span className="text-stone-900 font-medium">Learners</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">{course.name} — Learners</h1>
            <p className="text-sm text-stone-500 mt-1">
              {(enrollments ?? []).length} enrolled · passing threshold {course.passing_threshold}%
            </p>
          </div>
          <EnrollModalTrigger
            companyId={companyId}
            courseId={courseId}
            courseName={course.name}
            hasGmail={hasGmail}
          />
        </div>

        {(enrollments ?? []).length === 0 ? (
          <div className="text-center py-16 bg-white border border-stone-200 rounded-xl">
            <p className="text-stone-500 font-medium">No learners enrolled yet</p>
            <p className="text-stone-400 text-sm mt-1">
              Click &ldquo;Enroll Applicant&rdquo; above, or use the &ldquo;Send Training Link&rdquo; automation action.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-600 uppercase tracking-wide">
                      Learner
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-600 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-600 uppercase tracking-wide">
                      Enrolled
                    </th>
                    {regularModules.map((m, i) => (
                      <th
                        key={m.id}
                        className="text-center px-3 py-3 text-xs font-semibold text-stone-600 uppercase tracking-wide"
                      >
                        M{i + 1}
                      </th>
                    ))}
                    {finalExam && (
                      <th className="text-center px-3 py-3 text-xs font-semibold text-stone-600 uppercase tracking-wide">
                        Exam
                      </th>
                    )}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-600 uppercase tracking-wide">
                      Link
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(enrollments ?? []).map((enrollment) => {
                    const applicant = (enrollment as any).applicants;
                    const display = applicantDisplayMap[applicant?.id] ?? {
                      name: applicant?.full_name ?? "Unknown",
                      email: applicant?.email ?? "",
                    };
                    const moduleAttempts = bestAttempts[enrollment.id] ?? {};

                    return (
                      <tr key={enrollment.id} className="hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-stone-900">
                            {display.name}
                          </div>
                          <div className="text-xs text-stone-400">{display.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={enrollment.status} />
                        </td>
                        <td className="px-4 py-3 text-stone-500 text-xs whitespace-nowrap">
                          {new Date(enrollment.enrolled_at).toLocaleDateString()}
                        </td>
                        {regularModules.map((m) => {
                          const attempt = moduleAttempts[m.id];
                          return (
                            <td key={m.id} className="px-3 py-3 text-center">
                              <ModuleCell attempt={attempt} />
                            </td>
                          );
                        })}
                        {finalExam && (
                          <td className="px-3 py-3 text-center">
                            <ModuleCell attempt={moduleAttempts[finalExam.id]} />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <a
                            href={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/learn/${enrollment.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            Open ↗
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; class: string }> = {
    enrolled: { label: "Enrolled", class: "bg-blue-100 text-blue-700" },
    in_progress: { label: "In Progress", class: "bg-yellow-100 text-yellow-700" },
    completed: { label: "Completed", class: "bg-green-100 text-green-700" },
  };
  const cfg = map[status] ?? { label: status, class: "bg-stone-100 text-stone-600" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.class}`}>
      {cfg.label}
    </span>
  );
}

function ModuleCell({ attempt }: { attempt?: { score: number; passed: boolean } }) {
  if (!attempt) {
    return <Lock className="w-3.5 h-3.5 text-stone-300 mx-auto" />;
  }
  if (attempt.passed) {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {attempt.score}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium">
      <XCircle className="w-3.5 h-3.5" />
      {attempt.score}%
    </span>
  );
}
