import { createServiceClient } from "@/lib/supabase/service";
import { checkTokenValidity } from "@/lib/helpers/tokenExpiry";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";


export default async function LearnLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = createServiceClient();

  const { data: enrollment } = await svc
    .from("lms_enrollments")
    .select(`
      id,
      status,
      token_expires_at,
      token_revoked_at,
      lms_courses (
        id,
        name,
        description,
        company_id,
        companies (
          id,
          name,
          logo_url
        )
      )
    `)
    .eq("token", token)
    .single();

  if (!enrollment) notFound();

  const tokenError = checkTokenValidity(
    (enrollment as any).token_expires_at,
    (enrollment as any).token_revoked_at
  );

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

  const course = (enrollment as any).lms_courses;
  const company = course?.companies;

  return (
    <div className="min-h-screen bg-rf-surface-page flex flex-col">
      {/* Header */}
      <header className="bg-rf-surface-card border-b border-rf-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {company?.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name ?? "Company"}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <div className="h-8 px-3 bg-rf-blue text-white text-sm font-semibold rounded flex items-center">
              {company?.name ?? "Training"}
            </div>
          )}
          <div className="text-sm text-rf-text-secondary">
            {course?.name}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-3xl mx-auto">
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
