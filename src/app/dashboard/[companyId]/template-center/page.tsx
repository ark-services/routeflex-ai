import { createClient } from "@/lib/supabase/server";
import type { Template } from "@/lib/types";
import { TemplateCenterGrid } from "./template-center-grid";

export default async function TemplateCenterPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("templates")
    .select("id, title, description, thumbnail_path, is_published, created_at")
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const templates = (data ?? []) as Template[];

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="border-b border-stone-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-stone-900">Template Center</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Choose a template to quickly scaffold your hiring board.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <TemplateCenterGrid templates={templates} companyId={companyId} />
      </div>
    </div>
  );
}
