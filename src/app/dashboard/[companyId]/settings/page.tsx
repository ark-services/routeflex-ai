import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, logo_url, lms_enabled, account_id")
    .eq("id", companyId)
    .single();

  if (!company) notFound();

  // Fetch plan limits and current period usage
  const [{ data: planLimitsRows }, { data: periodRows }] = await Promise.all([
    supabase.rpc("get_account_plan_limits", { p_account_id: company.account_id }),
    supabase.rpc("get_or_create_action_period", { p_account_id: company.account_id }),
  ]);

  const planLimits = (planLimitsRows as any)?.[0];
  const period = (periodRows as any)?.[0];

  const planId: string = planLimits?.plan_id ?? "free";
  const actionsUsed: number = period?.used_units ?? 0;
  const actionsQuota: number = (period?.quota_units ?? 0) + (period?.extra_credits ?? 0);

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-stone-900">Company Settings</h1>
          <p className="text-sm text-stone-500 mt-1">Manage your company profile and branding.</p>
        </div>
        <SettingsClient
          company={company}
          companyId={companyId}
          planId={planId}
          actionsUsed={actionsUsed}
          actionsQuota={actionsQuota}
        />
      </div>
    </div>
  );
}
