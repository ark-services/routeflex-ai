import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { TemplateForm } from "../template-form";
import { DeleteTemplateButton } from "./delete-template-button";
import type { Template } from "@/lib/types";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .is("deleted_at", null)
    .single();

  if (error || !data) notFound();

  const template = data as Template;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/super-admin/templates"
          className="text-sm text-rf-text-secondary hover:text-rf-ink-700 transition-colors flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Templates
        </Link>
        <span className="text-rf-text-muted">/</span>
        <span className="text-sm text-rf-text-primary truncate max-w-xs">{template.title}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <h1 className="text-xl font-semibold text-rf-text-primary">Edit template</h1>
        <DeleteTemplateButton templateId={template.id} />
      </div>

      <TemplateForm template={template} />
    </div>
  );
}
