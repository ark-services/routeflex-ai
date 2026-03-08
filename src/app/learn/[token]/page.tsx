import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Lock, BookOpen, ClipboardCheck, ChevronRight } from "lucide-react";


export default async function LearnIndexPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = createServiceClient();

  const { data: enrollment } = await svc
    .from("lms_enrollments")
    .select(`
      id,
      status,
      completed_at,
      lms_courses (
        id,
        name,
        description,
        passing_threshold,
        lms_modules (
          id,
          title,
          is_final_exam,
          sort_order
        )
      )
    `)
    .eq("token", token)
    .single();

  if (!enrollment) notFound();

  const course = (enrollment as any).lms_courses;
  const allModules: any[] = (course?.lms_modules ?? []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order
  );
  const regularModules = allModules.filter((m) => !m.is_final_exam);
  const finalExam = allModules.find((m) => m.is_final_exam);

  // Load best passing attempts for this enrollment
  const { data: attempts } = await svc
    .from("lms_module_attempts")
    .select("module_id, score, passed")
    .eq("enrollment_id", enrollment.id)
    .eq("passed", true);

  const passedModuleIds = new Set((attempts ?? []).map((a: any) => a.module_id));

  // Best scores (for display)
  const { data: allAttempts } = await svc
    .from("lms_module_attempts")
    .select("module_id, score, passed")
    .eq("enrollment_id", enrollment.id)
    .order("score", { ascending: false });

  const bestScore: Record<string, { score: number; passed: boolean }> = {};
  for (const a of allAttempts ?? []) {
    if (!bestScore[a.module_id]) {
      bestScore[a.module_id] = { score: a.score, passed: a.passed };
    }
  }

  // Determine which modules are unlocked
  // Module 1: always unlocked
  // Module N: unlocked if module N-1 is passed
  // Final exam: unlocked if all regular modules are passed
  const allRegularPassed = regularModules.every((m: any) => passedModuleIds.has(m.id));

  function isUnlocked(module: any, index: number): boolean {
    if (module.is_final_exam) return allRegularPassed;
    if (index === 0) return true;
    return passedModuleIds.has(regularModules[index - 1].id);
  }

  if (enrollment.status === "completed") {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-rf-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-rf-success" />
        </div>
        <h1 className="text-2xl font-bold text-rf-text-primary mb-2">Course Complete!</h1>
        <p className="text-rf-text-secondary">
          You have successfully completed {course.name}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Course header */}
      <div>
        <h1 className="text-2xl font-bold text-rf-text-primary">{course.name}</h1>
        {course.description && (
          <p className="text-rf-text-secondary mt-1">{course.description}</p>
        )}
        <p className="text-xs text-rf-text-muted mt-2">
          Passing threshold: {course.passing_threshold}% per module
        </p>
      </div>

      {/* Module list */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-rf-ink-700 uppercase tracking-wide">
          Modules
        </h2>
        {regularModules.map((module: any, idx: number) => {
          const unlocked = isUnlocked(module, idx);
          const passed = passedModuleIds.has(module.id);
          const score = bestScore[module.id];

          return (
            <ModuleRow
              key={module.id}
              token={token}
              module={module}
              index={idx}
              unlocked={unlocked}
              passed={passed}
              bestScore={score}
            />
          );
        })}
      </div>

      {/* Final exam */}
      {finalExam && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-rf-ink-700 uppercase tracking-wide">
            Final Exam
          </h2>
          <div
            className={`flex items-center gap-4 p-4 bg-rf-surface-card border rounded-xl transition-colors ${
              allRegularPassed
                ? "border-rf-border hover:border-rf-blue-tint"
                : "border-rf-border opacity-50 cursor-not-allowed"
            }`}
          >
            <div className="flex-shrink-0">
              {passedModuleIds.has(finalExam.id) ? (
                <CheckCircle2 className="w-5 h-5 text-rf-success" />
              ) : allRegularPassed ? (
                <ClipboardCheck className="w-5 h-5 text-rf-blue" />
              ) : (
                <Lock className="w-5 h-5 text-rf-text-muted" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-rf-text-primary">{finalExam.title}</p>
              {!allRegularPassed && (
                <p className="text-xs text-rf-text-muted mt-0.5">Complete all modules to unlock</p>
              )}
              {bestScore[finalExam.id] && (
                <p className={`text-xs mt-0.5 font-medium ${bestScore[finalExam.id].passed ? "text-rf-success" : "text-rf-danger"}`}>
                  Best score: {bestScore[finalExam.id].score}%
                </p>
              )}
            </div>
            {allRegularPassed && (
              <Link
                href={`/learn/${token}/modules/${finalExam.id}`}
                className="flex items-center gap-1 text-xs text-rf-blue font-medium hover:text-rf-blue-dark"
              >
                {passedModuleIds.has(finalExam.id) ? "Review" : "Start"}
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleRow({
  token,
  module,
  index,
  unlocked,
  passed,
  bestScore,
}: {
  token: string;
  module: any;
  index: number;
  unlocked: boolean;
  passed: boolean;
  bestScore?: { score: number; passed: boolean };
}) {
  return (
    <div
      className={`flex items-center gap-4 p-4 bg-rf-surface-card border rounded-xl transition-colors ${
        unlocked
          ? "border-rf-border hover:border-rf-blue-tint"
          : "border-rf-border opacity-50"
      }`}
    >
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">
        {passed ? (
          <CheckCircle2 className="w-5 h-5 text-rf-success" />
        ) : unlocked ? (
          <span className="w-7 h-7 rounded-full bg-rf-blue-tint text-rf-blue flex items-center justify-center text-xs font-bold">
            {index + 1}
          </span>
        ) : (
          <Lock className="w-4 h-4 text-rf-text-muted" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-rf-text-primary">{module.title}</p>
        {bestScore && (
          <p className={`text-xs mt-0.5 font-medium ${bestScore.passed ? "text-rf-success" : "text-rf-danger"}`}>
            Best score: {bestScore.score}%
          </p>
        )}
      </div>
      {unlocked && (
        <Link
          href={`/learn/${token}/modules/${module.id}`}
          className="flex items-center gap-1 text-xs text-rf-blue font-medium hover:text-rf-blue-dark"
        >
          {passed ? "Review" : "Start"}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}
