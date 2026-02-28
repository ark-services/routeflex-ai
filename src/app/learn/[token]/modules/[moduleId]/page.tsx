import { createClient as createServiceClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function ModuleContentPage({
  params,
}: {
  params: Promise<{ token: string; moduleId: string }>;
}) {
  const { token, moduleId } = await params;
  const svc = getSvc();

  // Load enrollment + course
  const { data: enrollment } = await svc
    .from("lms_enrollments")
    .select(`
      id,
      status,
      lms_courses (
        id,
        passing_threshold,
        lms_modules (
          id,
          title,
          content,
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

  // Check if this module is unlocked
  const { data: attempts } = await svc
    .from("lms_module_attempts")
    .select("module_id, passed")
    .eq("enrollment_id", enrollment.id)
    .eq("passed", true);

  const passedModuleIds = new Set((attempts ?? []).map((a: any) => a.module_id));

  // Gate: is this module accessible?
  if (mod.is_final_exam) {
    const allRegularPassed = regularModules.every((m: any) => passedModuleIds.has(m.id));
    if (!allRegularPassed) notFound();
  } else {
    const idx = regularModules.findIndex((m: any) => m.id === moduleId);
    if (idx > 0 && !passedModuleIds.has(regularModules[idx - 1].id)) notFound();
  }

  // Find question count for quiz button label
  const { count: questionCount } = await svc
    .from("lms_questions")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/learn/${token}`}
        className="inline-flex items-center gap-1 text-sm text-rf-text-secondary hover:text-rf-ink-700 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to course
      </Link>

      {/* Module title */}
      <div>
        <h1 className="text-2xl font-bold text-rf-text-primary">{mod.title}</h1>
        {mod.is_final_exam && (
          <p className="text-sm text-rf-text-secondary mt-1">
            This is the final exam. You must pass all modules before taking it.
          </p>
        )}
      </div>

      {/* Content (only for regular modules) */}
      {!mod.is_final_exam && mod.content && (
        <div className="bg-rf-surface-card border border-rf-border rounded-xl p-6">
          <div className="prose prose-neutral prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {mod.content}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {!mod.is_final_exam && !mod.content && (
        <div className="bg-rf-surface-card border border-rf-border rounded-xl p-6 text-rf-text-muted text-sm text-center">
          No content for this module.
        </div>
      )}

      {/* Take quiz CTA */}
      {(questionCount ?? 0) > 0 ? (
        <div className="bg-rf-blue-tint border border-rf-blue-tint rounded-xl p-5 flex items-center gap-4">
          <ClipboardList className="w-6 h-6 text-rf-blue flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-rf-ink-900">
              {mod.is_final_exam ? "Ready for the Final Exam?" : "Ready to test your knowledge?"}
            </p>
            <p className="text-sm text-rf-blue mt-0.5">
              {questionCount} question{questionCount !== 1 ? "s" : ""} · multiple choice
            </p>
          </div>
          <Link
            href={`/learn/${token}/modules/${moduleId}/quiz`}
            className="px-4 py-2 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue-dark transition-colors flex items-center gap-1.5"
          >
            Take Quiz
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="text-sm text-rf-text-muted text-center py-4">
          No quiz questions have been added to this module yet.
        </div>
      )}
    </div>
  );
}
