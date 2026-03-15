import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import TemplateEditor from "./TemplateEditor";

export default async function ScreeningTemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const svc = createServiceClient();

  const [{ data: template }, { data: questions }] = await Promise.all([
    svc
      .from("screening_templates")
      .select("id, name, description, is_active")
      .eq("id", templateId)
      .single(),
    svc
      .from("screening_template_questions")
      .select("id, sort_order, text, type, options, is_dealbreaker, dealbreaker_condition, ai_scoring_guidance")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!template) notFound();

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-rf-text-secondary mb-6">
        <Link
          href="/super-admin/screening/templates"
          className="hover:text-rf-text-primary transition-colors flex items-center gap-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Screening Templates
        </Link>
        <span>/</span>
        <span className="text-rf-text-primary font-medium">{template.name || "Untitled"}</span>
      </div>

      <TemplateEditor
        template={template}
        initialQuestions={questions ?? []}
      />
    </div>
  );
}
