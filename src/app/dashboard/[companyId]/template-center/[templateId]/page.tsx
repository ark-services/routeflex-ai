import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Layers } from "lucide-react";
import type { Template, Job } from "@/lib/types";
import { UseTemplatePanel } from "./use-template-panel";
import { TemplateThumbnail } from "../template-thumbnail";

export default async function TemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; templateId: string }>;
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { companyId, templateId } = await params;
  const { jobId } = await searchParams;

  const supabase = await createClient();

  // Load template
  const { data: templateData, error } = await supabase
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .eq("is_published", true)
    .is("deleted_at", null)
    .single();

  if (error || !templateData) notFound();

  const template = templateData as Template;

  // Load jobs for this company (for the job picker)
  const { data: jobsData } = await supabase
    .from("jobs")
    .select("id, title, status")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const jobs = (jobsData ?? []) as Job[];

  // Count groups in payload for display
  const groupCount = template.payload?.groups?.length ?? 0;

  return (
    <div className="h-full overflow-auto">
      {/* Top bar */}
      <div className="border-b border-rf-border bg-rf-surface-card px-6 py-3 flex items-center gap-3">
        <Link
          href={`/dashboard/${companyId}/template-center`}
          className="flex items-center gap-1 text-sm text-rf-text-secondary hover:text-rf-ink-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Template Center
        </Link>
        <span className="text-rf-text-muted">/</span>
        <span className="text-sm text-rf-ink-700 truncate max-w-xs">{template.title}</span>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Left — details */}
          <div className="flex-1 min-w-0">
            {/* Thumbnail */}
            <div className="w-full h-52 rounded-xl overflow-hidden mb-6 bg-rf-ink-100">
              <TemplateThumbnail
                thumbnailPath={template.thumbnail_path}
                title={template.title}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-rf-text-primary">{template.title}</h1>

            {/* Meta */}
            <div className="flex items-center gap-4 mt-2 text-sm text-rf-text-secondary">
              <span className="flex items-center gap-1.5">
                <Layers className="h-4 w-4" />
                {groupCount} group{groupCount !== 1 ? "s" : ""}
              </span>
              <span>
                Added{" "}
                {new Date(template.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>

            {/* Description */}
            {template.description && (
              <p className="mt-5 text-rf-ink-500 leading-relaxed">{template.description}</p>
            )}

            {/* Groups preview */}
            {groupCount > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-rf-ink-700 mb-3">
                  Groups in this template
                </h2>
                <div className="space-y-2">
                  {template.payload.groups.map((g, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-3 py-2 bg-rf-surface-page rounded-lg border border-rf-ink-100"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: g.color ?? "#0073ea" }}
                      />
                      <span className="text-sm text-rf-ink-700">{g.name}</span>
                      {(g.rows?.length ?? 0) > 0 && (
                        <span className="ml-auto text-xs text-rf-text-muted">
                          {g.rows!.length} row{g.rows!.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — Use template panel */}
          <div className="md:w-72 flex-shrink-0">
            <UseTemplatePanel
              templateId={templateId}
              companyId={companyId}
              jobs={jobs}
              preselectedJobId={jobId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
