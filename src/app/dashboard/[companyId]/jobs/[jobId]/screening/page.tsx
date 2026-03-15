import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import ScreeningBuilder from "./ScreeningBuilder";

export default async function ScreeningPage({
  params,
}: {
  params: Promise<{ companyId: string; jobId: string }>;
}) {
  const { companyId, jobId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, account_id")
    .eq("id", companyId)
    .single();
  if (!company) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .single();
  if (!job) redirect(`/dashboard/${companyId}`);

  const svc = createServiceClient();

  const { data: config } = await svc
    .from("screening_configs")
    .select(`
      id,
      deadline_hours,
      auto_reject_dealbreakers,
      screening_questions (
        id,
        sort_order,
        text,
        type,
        options,
        is_dealbreaker,
        dealbreaker_condition,
        ai_scoring_guidance
      )
    `)
    .eq("job_id", jobId)
    .maybeSingle();

  const { data: templates } = await svc
    .from("screening_templates")
    .select("id, name, description")
    .eq("is_active", true)
    .order("name");

  const questions = ((config?.screening_questions ?? []) as any[]).sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="border-b border-rf-border bg-rf-surface-card px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold text-rf-text-primary">{job.title} — Screening</h1>
        <p className="text-sm text-rf-text-secondary mt-0.5">
          Build the questionnaire applicants complete after you send them a screening link via automation.
        </p>
      </div>

      {/* Builder + settings panel */}
      <div className="flex-1 flex overflow-hidden">
        <ScreeningBuilder
          companyId={companyId}
          jobId={jobId}
          config={config ? {
            id: config.id,
            deadline_hours: config.deadline_hours,
            auto_reject_dealbreakers: config.auto_reject_dealbreakers,
          } : null}
          initialQuestions={questions}
          templates={templates ?? []}
        />
      </div>
    </div>
  );
}
