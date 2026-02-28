import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { TemplateForm } from "../template-form";

export default function NewTemplatePage() {
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
        <span className="text-sm text-rf-text-primary">New template</span>
      </div>

      <h1 className="text-xl font-semibold text-rf-text-primary mb-6">New template</h1>

      <TemplateForm />
    </div>
  );
}
