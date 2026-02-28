import { createClient as createServiceClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function LearnLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = getSvc();

  const { data: enrollment } = await svc
    .from("lms_enrollments")
    .select(`
      id,
      status,
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

      <footer className="border-t border-rf-border py-4 text-center text-xs text-rf-text-muted">
        Powered by RouteFlex
      </footer>
    </div>
  );
}
