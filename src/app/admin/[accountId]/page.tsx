import { requireAdmin } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ActionQuotaMeter } from "@/components/admin/action-quota-meter";

export default async function AdminOverviewPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const membership = await requireAdmin(accountId);
  const supabase = await createClient();

  const { data: period } = await supabase.rpc("get_or_create_action_period", { p_account_id: accountId }).single();

  const { count: automationCount } = await supabase.from("automation_rules").select("*", { count: "exact", head: true }).eq("account_id", accountId);

  const periodData = period as any || { quota_units: 3000, used_units: 0, period_end: new Date().toISOString() };
  const actionsRemaining = periodData.quota_units - periodData.used_units;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="text-sm font-medium text-stone-500 mb-1">Automations</div>
          <div className="text-3xl font-semibold text-stone-900">{automationCount ?? 0}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-stone-500 mb-1">Actions Used</div>
          <div className="text-3xl font-semibold text-stone-900">{periodData.used_units.toLocaleString()}</div>
          <div className="text-xs text-stone-400 mt-1">of {periodData.quota_units.toLocaleString()}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-stone-500 mb-1">Actions Remaining</div>
          <div className={`text-3xl font-semibold ${actionsRemaining < 0 ? "text-red-600" : "text-stone-900"}`}>
            {actionsRemaining.toLocaleString()}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-stone-900 mb-4">Action Quota</h2>
        <ActionQuotaMeter used={periodData.used_units} limit={periodData.quota_units} resetDate={periodData.period_end} />
      </Card>
    </div>
  );
}
