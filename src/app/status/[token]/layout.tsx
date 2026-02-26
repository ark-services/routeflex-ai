import { createClient as createServiceClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function StatusPortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = getSvc();

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
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {company?.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name ?? "Company"}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <div className="h-8 px-3 bg-blue-600 text-white text-sm font-semibold rounded flex items-center">
              {company?.name ?? "Application Status"}
            </div>
          )}
          {job?.title && (
            <div className="text-sm text-stone-500">{job.title}</div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>

      <footer className="border-t border-stone-200 py-4 text-center text-xs text-stone-400">
        Powered by RouteFlex
      </footer>
    </div>
  );
}
