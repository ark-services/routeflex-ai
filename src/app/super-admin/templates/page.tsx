import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Plus, Eye, EyeOff } from "lucide-react";
import type { Template } from "@/lib/types";
import { TemplateThumbnail } from "@/app/dashboard/[companyId]/template-center/template-thumbnail";

export default async function SuperAdminTemplatesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const templates = (data ?? []) as Template[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Templates</h1>
          <p className="text-sm text-stone-500 mt-1">
            Manage template definitions visible to all users.
          </p>
        </div>
        <Link
          href="/super-admin/templates/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New template
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error.message}
        </div>
      )}

      {templates.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <p className="text-sm">No templates yet.</p>
          <Link
            href="/super-admin/templates/new"
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            Create the first one →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/super-admin/templates/${t.id}`}
              className="flex items-center gap-4 p-4 bg-white border border-stone-200 rounded-lg hover:border-stone-300 hover:shadow-sm transition-all"
            >
              {/* Thumbnail preview */}
              <div className="w-16 h-10 rounded bg-stone-100 flex-shrink-0 overflow-hidden">
                <TemplateThumbnail
                  thumbnailPath={t.thumbnail_path}
                  title={t.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-stone-900 truncate">
                    {t.title}
                  </span>
                  {t.is_published ? (
                    <Eye className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-stone-400 flex-shrink-0" />
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-stone-500 truncate mt-0.5">{t.description}</p>
                )}
              </div>

              <div className="text-xs text-stone-400 flex-shrink-0">
                {new Date(t.created_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
