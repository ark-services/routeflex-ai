import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Template } from "@/lib/types";
import { TemplateCenterGrid } from "./template-center-grid";
import { ClipboardList } from "lucide-react";

export default async function TemplateCenterPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();
  const svc = createServiceClient();

  const [{ data }, { data: screeningTemplates }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, title, description, thumbnail_path, is_published, created_at")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    svc
      .from("screening_templates")
      .select("id, name, description")
      .eq("is_active", true)
      .order("name"),
  ]);

  const templates = (data ?? []) as Template[];

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="border-b border-rf-border bg-rf-surface-card px-6 py-4">
        <h1 className="text-lg font-semibold text-rf-text-primary">Template Center</h1>
        <p className="text-sm text-rf-text-secondary mt-0.5">
          Choose a template to quickly scaffold your hiring board.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-10">
        <TemplateCenterGrid templates={templates} companyId={companyId} />

        {/* Screening Templates */}
        {(screeningTemplates ?? []).length > 0 && (
          <div>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-rf-text-primary">Screening Templates</h2>
              <p className="text-sm text-rf-text-secondary mt-0.5">
                Pre-built questionnaire question sets you can apply to any job&apos;s screening setup.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(screeningTemplates ?? []).map((t) => (
                <div
                  key={t.id}
                  className="bg-rf-surface-card border border-rf-border rounded-lg p-4 flex items-start gap-3"
                >
                  <ClipboardList className="h-5 w-5 text-rf-text-muted flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-rf-text-primary">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-rf-text-muted mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                    <p className="text-xs text-rf-text-muted mt-2">
                      Apply in Job → Screening settings
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
