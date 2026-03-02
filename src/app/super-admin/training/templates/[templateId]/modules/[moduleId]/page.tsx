import { createClient as createServiceClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleEditor } from "./ModuleEditor";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function TemplateModulePage({
  params,
}: {
  params: Promise<{ templateId: string; moduleId: string }>;
}) {
  const { templateId, moduleId } = await params;
  const svc = getSvc();

  const [{ data: template }, { data: mod }, { data: questions }] = await Promise.all([
    svc.from("lms_course_templates").select("id, name").eq("id", templateId).single(),
    svc
      .from("lms_template_modules")
      .select("id, title, content, is_final_exam, sort_order")
      .eq("id", moduleId)
      .single(),
    svc
      .from("lms_template_questions")
      .select("id, question_text, options, correct_option_id, sort_order")
      .eq("template_module_id", moduleId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!template || !mod) notFound();

  // For the final exam, fetch all other modules' content so "Generate Questions"
  // can generate across the full course rather than requiring exam-level content.
  let templateContent: string | undefined;
  if (mod.is_final_exam) {
    const { data: otherModules } = await svc
      .from("lms_template_modules")
      .select("title, content")
      .eq("template_id", templateId)
      .eq("is_final_exam", false)
      .order("sort_order", { ascending: true });

    if (otherModules && otherModules.length > 0) {
      templateContent = otherModules
        .filter((m) => m.content?.trim())
        .map((m) => `## ${m.title}\n\n${m.content}`)
        .join("\n\n---\n\n");
    }
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-rf-text-secondary mb-6">
        <Link href="/super-admin/training/templates" className="hover:text-rf-ink-700 transition-colors">
          Training Templates
        </Link>
        <span>/</span>
        <Link
          href={`/super-admin/training/templates/${templateId}`}
          className="hover:text-rf-ink-700 transition-colors"
        >
          {template.name}
        </Link>
        <span>/</span>
        <span className="text-rf-text-primary font-medium">{mod.title}</span>
      </div>

      <ModuleEditor
        templateId={templateId}
        module={mod}
        questions={questions ?? []}
        templateContent={templateContent}
      />
    </div>
  );
}
