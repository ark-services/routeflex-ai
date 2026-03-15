import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { Plus, ClipboardList, Eye, EyeOff } from "lucide-react";
import { createTemplate } from "./actions";

export default async function ScreeningTemplatesPage() {
  const svc = createServiceClient();
  const { data: templates } = await svc
    .from("screening_templates")
    .select("id, name, description, is_active, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-rf-text-primary">Screening Templates</h1>
          <p className="text-sm text-rf-text-secondary mt-1">
            Reusable question sets DSP owners can apply to their jobs.
          </p>
        </div>
        <form action={createTemplate}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Template
          </button>
        </form>
      </div>

      {(templates ?? []).length === 0 ? (
        <div className="text-center py-16 text-rf-text-muted">
          <ClipboardList className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No screening templates yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(templates ?? []).map((t) => (
            <Link
              key={t.id}
              href={`/super-admin/screening/templates/${t.id}`}
              className="flex items-center gap-4 px-4 py-3 bg-rf-surface-card border border-rf-border rounded-lg hover:border-rf-blue/40 transition-colors"
            >
              <ClipboardList className="h-4 w-4 text-rf-text-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-rf-text-primary">{t.name || "Untitled"}</p>
                {t.description && (
                  <p className="text-xs text-rf-text-muted truncate">{t.description}</p>
                )}
              </div>
              {t.is_active ? (
                <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                  <Eye className="h-3 w-3" />
                  Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-rf-text-muted bg-rf-surface-page border border-rf-border px-2 py-0.5 rounded">
                  <EyeOff className="h-3 w-3" />
                  Inactive
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
