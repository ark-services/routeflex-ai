import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Lock, Clock } from "lucide-react";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function ApplicantTrainingPage({
  params,
}: {
  params: Promise<{ companyId: string; applicantId: string }>;
}) {
  const { companyId, applicantId } = await params;
  const supabase = await createClient();
  const svc = getSvc();

  // Verify applicant belongs to this company (RLS)
  const { data: applicant } = await supabase
    .from("applicants")
    .select("id, full_name, email, job_id")
    .eq("id", applicantId)
    .eq("company_id", companyId)
    .single();

  if (!applicant) notFound();

  // Load all enrollments for this applicant
  const { data: enrollments } = await svc
    .from("lms_enrollments")
    .select(`
      id,
      status,
      enrolled_at,
      completed_at,
      token,
      lms_courses (
        id,
        name,
        passing_threshold,
        lms_modules (
          id,
          title,
          is_final_exam,
          sort_order
        )
      )
    `)
    .eq("applicant_id", applicantId)
    .order("enrolled_at", { ascending: false });

  // Load all module attempts across all enrollments
  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  let allAttempts: any[] = [];
  if (enrollmentIds.length > 0) {
    const { data } = await svc
      .from("lms_module_attempts")
      .select("enrollment_id, module_id, score, passed")
      .in("enrollment_id", enrollmentIds)
      .order("score", { ascending: false });
    allAttempts = data ?? [];
  }

  // Build best attempt map per enrollment+module
  const bestByEnrollment: Record<string, Record<string, { score: number; passed: boolean }>> = {};
  for (const a of allAttempts) {
    if (!bestByEnrollment[a.enrollment_id]) bestByEnrollment[a.enrollment_id] = {};
    if (!bestByEnrollment[a.enrollment_id][a.module_id]) {
      bestByEnrollment[a.enrollment_id][a.module_id] = { score: a.score, passed: a.passed };
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-stone-500 mb-6">
          <Link href={`/dashboard/${companyId}/training`} className="hover:text-stone-700 transition-colors">
            Training
          </Link>
          <span>/</span>
          <span className="text-stone-900 font-medium">{applicant.full_name}</span>
        </div>

        <div className="mb-6">
          <h1 className="text-lg font-semibold text-stone-900">{applicant.full_name}</h1>
          <p className="text-sm text-stone-500">{applicant.email}</p>
        </div>

        {(enrollments ?? []).length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
            <p className="text-stone-500 font-medium">No training enrollments</p>
            <p className="text-stone-400 text-sm mt-1">
              This applicant has not been enrolled in any courses yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {(enrollments ?? []).map((enrollment) => {
              const course = (enrollment as any).lms_courses;
              const allModules: any[] = (course?.lms_modules ?? []).sort(
                (a: any, b: any) => a.sort_order - b.sort_order
              );
              const regularModules = allModules.filter((m: any) => !m.is_final_exam);
              const finalExam = allModules.find((m: any) => m.is_final_exam);
              const moduleAttempts = bestByEnrollment[enrollment.id] ?? {};

              return (
                <div key={enrollment.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-900">{course?.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <StatusBadge status={enrollment.status} />
                        <span className="text-xs text-stone-400">
                          Enrolled {new Date(enrollment.enrolled_at).toLocaleDateString()}
                        </span>
                        {enrollment.completed_at && (
                          <span className="text-xs text-stone-400">
                            · Completed {new Date(enrollment.completed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <a
                      href={`${appUrl}/learn/${enrollment.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Training link ↗
                    </a>
                  </div>

                  <div className="p-4 space-y-2">
                    {regularModules.map((m: any, idx: number) => (
                      <ModuleRow
                        key={m.id}
                        title={m.title}
                        index={idx}
                        attempt={moduleAttempts[m.id]}
                      />
                    ))}
                    {finalExam && (
                      <ModuleRow
                        key={finalExam.id}
                        title={finalExam.title}
                        isFinalExam
                        attempt={moduleAttempts[finalExam.id]}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    enrolled: { label: "Enrolled", cls: "bg-blue-100 text-blue-700" },
    in_progress: { label: "In Progress", cls: "bg-yellow-100 text-yellow-700" },
    completed: { label: "Completed", cls: "bg-green-100 text-green-700" },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-stone-100 text-stone-600" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function ModuleRow({
  title,
  index,
  isFinalExam,
  attempt,
}: {
  title: string;
  index?: number;
  isFinalExam?: boolean;
  attempt?: { score: number; passed: boolean };
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-stone-50 last:border-0">
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {!attempt ? (
          <Lock className="w-3.5 h-3.5 text-stone-300" />
        ) : attempt.passed ? (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400" />
        )}
      </div>
      <span className="flex-1 text-sm text-stone-700">
        {isFinalExam ? (
          <span className="font-medium">{title} (Final Exam)</span>
        ) : (
          <span>
            <span className="text-stone-400 text-xs mr-1.5">{(index ?? 0) + 1}.</span>
            {title}
          </span>
        )}
      </span>
      {attempt && (
        <span className={`text-xs font-medium ${attempt.passed ? "text-green-600" : "text-red-500"}`}>
          {attempt.score}%
        </span>
      )}
      {!attempt && (
        <span className="text-xs text-stone-400">Not started</span>
      )}
    </div>
  );
}
