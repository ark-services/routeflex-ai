import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";


export default async function StatusPortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = createServiceClient();

  const { data: applicant } = await svc
    .from("applicants")
    .select(`
      id,
      full_name,
      jobs (
        title,
        companies (
          name,
          logo_url
        )
      )
    `)
    .eq("portal_token", token)
    .single();

  if (!applicant) notFound();

  const job = (applicant as any).jobs;
  const company = job?.companies;

  return (
    <div className="min-h-screen bg-rf-surface-page flex flex-col">
      {/* Header */}
      <header className="bg-rf-surface-card border-b border-rf-border px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {company?.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name ?? "Company"}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <div className="h-8 px-3 bg-rf-blue text-white text-sm font-semibold rounded flex items-center">
              {company?.name ?? "Application Status"}
            </div>
          )}
          {job?.title && (
            <div className="text-sm text-rf-text-secondary">{job.title}</div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>

      <footer className="border-t border-rf-border py-4 flex flex-col items-center gap-1.5">
        <RouteFlexLogo size="nav" />
        <span className="text-xs text-rf-text-muted">Powered by RouteFlex</span>
      </footer>
    </div>
  );
}
