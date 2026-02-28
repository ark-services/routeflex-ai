import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ModuleEditor } from "./ModuleEditor";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ companyId: string; courseId: string; moduleId: string }>;
}) {
  const { companyId, courseId, moduleId } = await params;
  const supabase = await createClient();
  const svc = getSvc();

  // Gate: lms_enabled
  const { data: company } = await supabase
    .from("companies")
    .select("id, lms_enabled")
    .eq("id", companyId)
    .single();
  if (!company?.lms_enabled) redirect(`/dashboard/${companyId}/training`);

  // Verify course belongs to this company
  const { data: course } = await supabase
    .from("lms_courses")
    .select("id, name")
    .eq("id", courseId)
    .eq("company_id", companyId)
    .single();
  if (!course) notFound();

  const [{ data: mod }, { data: questions }] = await Promise.all([
    svc
      .from("lms_modules")
      .select("id, title, content, is_final_exam")
      .eq("id", moduleId)
      .eq("course_id", courseId)
      .single(),
    svc
      .from("lms_questions")
      .select("id, question_text, options, correct_option_id, sort_order")
      .eq("module_id", moduleId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!mod) notFound();

  return (
    <div className="min-h-screen bg-rf-surface-page p-6">
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-rf-text-secondary mb-6">
          <Link href={`/dashboard/${companyId}/training`} className="hover:text-rf-ink-700 transition-colors">
            Training
          </Link>
          <span>/</span>
          <Link href={`/dashboard/${companyId}/training/${courseId}`} className="hover:text-rf-ink-700 transition-colors">
            {course.name}
          </Link>
          <span>/</span>
          <span className="text-rf-text-primary font-medium">{mod.title}</span>
        </div>

        <ModuleEditor
          companyId={companyId}
          courseId={courseId}
          module={mod}
          questions={questions ?? []}
        />
      </div>
    </div>
  );
}
