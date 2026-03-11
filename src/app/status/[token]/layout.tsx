import { createServiceClient } from "@/lib/supabase/service";
import { checkTokenValidity } from "@/lib/helpers/tokenExpiry";
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

  // Token expiry columns added in migration 00102 — query separately so the
  // main applicant lookup never fails if the migration hasn't been applied yet.
  let tokenError: string | null = null;
  const { data: tokenInfo, error: tokenQueryError } = await svc
    .from("applicants")
    .select("token_expires_at, token_revoked_at")
    .eq("id", applicant.id)
    .single();

  if (!tokenQueryError && tokenInfo) {
    tokenError = checkTokenValidity(
      (tokenInfo as any).token_expires_at,
      (tokenInfo as any).token_revoked_at
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-rf-surface-page flex items-center justify-center">
        <div className="max-w-md text-center p-8">
          <h1 className="text-xl font-bold text-rf-text-primary mb-2">Link Unavailable</h1>
          <p className="text-rf-text-secondary">{tokenError}</p>
        </div>
      </div>
    );
  }

  const job = (applicant as any).jobs;
  const company = job?.companies;

  return (
    <div className="min-h-screen bg-rf-surface-page flex flex-col">
      {/* Brand accent strip */}
      <div className="h-[3px] bg-gradient-to-r from-[var(--rf-blue-dark)] via-[var(--rf-blue)] to-[var(--rf-blue-light)]" />

      {/* Header */}
      <header className="bg-rf-surface-card border-b border-rf-border">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          {company?.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name ?? "Company"}
              className="h-9 w-auto object-contain"
            />
          ) : (
            <span className="text-base font-bold text-rf-text-primary tracking-tight font-[family-name:var(--font-darker-grotesque)]">
              {company?.name ?? "Application Status"}
            </span>
          )}
          {job?.title && (
            <>
              <div className="h-5 w-px bg-rf-ink-100" />
              <span className="text-sm text-rf-text-secondary">{job.title}</span>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-10">
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>

      <footer className="py-6 flex flex-col items-center gap-2">
        <RouteFlexLogo size="nav" />
        <span className="text-xs text-rf-text-muted">Powered by RouteFlex</span>
      </footer>
    </div>
  );
}
