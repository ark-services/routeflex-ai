import { createClient as createServiceClient } from "@supabase/supabase-js";
import Link from "next/link";
import { Plus, Eye, EyeOff, BookOpen } from "lucide-react";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const CARRIER_LABELS: Record<string, string> = {
  fedex_pd: "FedEx P&D",
  fedex_linehaul: "FedEx Linehaul",
  amazon_dsp: "Amazon DSP",
  custom: "Custom",
};

export default async function TrainingTemplatesPage() {
  const svc = getSvc();
  const { data: templates, error } = await svc
    .from("lms_course_templates")
    .select("id, name, description, carrier_type, is_published, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-rf-text-primary">Training Templates</h1>
          <p className="text-sm text-rf-text-secondary mt-1">
            Carrier-specific course templates companies can clone.
          </p>
        </div>
        <Link
          href="/super-admin/training/templates/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          New template
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rf-danger-bg border border-red-200 rounded-lg text-sm text-red-700">
          {error.message}
        </div>
      )}

      {(templates ?? []).length === 0 ? (
        <div className="text-center py-16 text-rf-text-muted">
          <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No training templates yet.</p>
          <Link
            href="/super-admin/training/templates/new"
            className="mt-3 inline-block text-sm text-rf-blue hover:underline"
          >
            Create the first one →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {(templates ?? []).map((t) => (
            <Link
              key={t.id}
              href={`/super-admin/training/templates/${t.id}`}
              className="flex items-center gap-4 p-4 bg-rf-surface-card border border-rf-border rounded-lg hover:border-rf-ink-100 hover:shadow-sm transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-rf-blue-tint flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-rf-blue" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-rf-text-primary">{t.name}</span>
                  {t.carrier_type && (
                    <span className="px-1.5 py-0.5 text-xs bg-rf-ink-100 text-rf-ink-500 rounded">
                      {CARRIER_LABELS[t.carrier_type] ?? t.carrier_type}
                    </span>
                  )}
                  {t.is_published ? (
                    <Eye className="h-3.5 w-3.5 text-rf-success" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-rf-text-muted" />
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-rf-text-secondary truncate mt-0.5">{t.description}</p>
                )}
              </div>

              <div className="text-xs text-rf-text-muted flex-shrink-0">
                {new Date(t.created_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
