import { createClient as createServiceClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { QuizForm } from "./QuizForm";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function QuizPage({
  params,
}: {
  params: Promise<{ token: string; moduleId: string }>;
}) {
  const { token, moduleId } = await params;
  const svc = getSvc();

  // Load enrollment + module
  const { data: enrollment } = await svc
    .from("lms_enrollments")
    .select(`
      id,
      lms_courses (
        id,
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
  const regularModules = allModules.filter((m: any) => !m.is_final_exam);
  const mod = allModules.find((m: any) => m.id === moduleId);
  if (!mod) notFound();

  // Gate check
  const { data: passedAttempts } = await svc
    .from("lms_module_attempts")
    .select("module_id")
    .eq("enrollment_id", enrollment.id)
    .eq("passed", true);
  const passedModuleIds = new Set((passedAttempts ?? []).map((a: any) => a.module_id));

  if (mod.is_final_exam) {
    const allPassed = regularModules.every((m: any) => passedModuleIds.has(m.id));
    if (!allPassed) notFound();
  } else {
    const idx = regularModules.findIndex((m: any) => m.id === moduleId);
    if (idx > 0 && !passedModuleIds.has(regularModules[idx - 1].id)) notFound();
  }

  // Load questions (randomise order for each attempt)
  const { data: questions } = await svc
    .from("lms_questions")
    .select("id, question_text, options, sort_order")
    .eq("module_id", moduleId)
    .order("sort_order", { ascending: true });

  if (!questions || questions.length === 0) notFound();

  return (
    <div className="space-y-6">
      <Link
        href={`/learn/${token}/modules/${moduleId}`}
        className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to module
      </Link>

      <div>
        <h1 className="text-xl font-bold text-stone-900">{mod.title} — Quiz</h1>
        <p className="text-sm text-stone-500 mt-1">
          {questions.length} questions · {course.passing_threshold}% to pass · unlimited attempts
        </p>
      </div>

      <QuizForm
        token={token}
        enrollmentId={enrollment.id}
        moduleId={moduleId}
        passingThreshold={course.passing_threshold}
        questions={questions}
        isFinalExam={mod.is_final_exam}
      />
    </div>
  );
}
