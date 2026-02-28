import { createClient as createServiceClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, BookOpen, ClipboardCheck } from "lucide-react";
import { TemplateSettingsForm } from "./TemplateSettingsForm";
import { AddModuleForm } from "./AddModuleForm";
import { DeleteModuleButton } from "./DeleteModuleButton";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function TrainingTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const svc = getSvc();

  const [{ data: template }, { data: modules }] = await Promise.all([
    svc
      .from("lms_course_templates")
      .select("id, name, description, carrier_type, is_published")
      .eq("id", templateId)
      .single(),
    svc
      .from("lms_template_modules")
      .select("id, title, is_final_exam, sort_order, created_at")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!template) notFound();

  const regularModules = (modules ?? []).filter((m) => !m.is_final_exam);
  const finalExam = (modules ?? []).find((m) => m.is_final_exam);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-rf-text-secondary mb-6">
        <Link href="/super-admin/training/templates" className="hover:text-rf-ink-700 transition-colors">
          Training Templates
        </Link>
        <span>/</span>
        <span className="text-rf-text-primary font-medium">{template.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Template settings */}
        <div className="lg:col-span-1">
          <TemplateSettingsForm template={template} />
        </div>

        {/* Right: Modules */}
        <div className="lg:col-span-2 space-y-4">
          {/* Regular modules */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-rf-ink-700 uppercase tracking-wide">Modules</h2>
            </div>

            {regularModules.length === 0 ? (
              <p className="text-sm text-rf-text-muted py-4 text-center border border-dashed border-rf-border rounded-lg">
                No modules yet
              </p>
            ) : (
              <div className="space-y-2">
                {regularModules.map((m, idx) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-3 bg-rf-surface-card border border-rf-border rounded-lg"
                  >
                    <div className="w-6 h-6 rounded-full bg-rf-ink-100 flex items-center justify-center text-xs font-semibold text-rf-text-secondary flex-shrink-0">
                      {idx + 1}
                    </div>
                    <BookOpen className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                    <Link
                      href={`/super-admin/training/templates/${templateId}/modules/${m.id}`}
                      className="flex-1 text-sm text-rf-text-primary hover:text-rf-blue transition-colors font-medium"
                    >
                      {m.title}
                    </Link>
                    <DeleteModuleButton moduleId={m.id} templateId={templateId} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add module form */}
          <AddModuleForm templateId={templateId} isFinalExam={false} />

          {/* Final exam */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-rf-ink-700 uppercase tracking-wide">Final Exam</h2>
              <span className="text-xs text-rf-text-muted">(unlocked after all modules pass)</span>
            </div>

            {finalExam ? (
              <div className="flex items-center gap-3 p-3 bg-rf-surface-card border border-rf-border rounded-lg">
                <ClipboardCheck className="w-4 h-4 text-rf-success flex-shrink-0" />
                <Link
                  href={`/super-admin/training/templates/${templateId}/modules/${finalExam.id}`}
                  className="flex-1 text-sm text-rf-text-primary hover:text-rf-blue transition-colors font-medium"
                >
                  {finalExam.title}
                </Link>
                <DeleteModuleButton moduleId={finalExam.id} templateId={templateId} />
              </div>
            ) : (
              <AddModuleForm templateId={templateId} isFinalExam={true} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
