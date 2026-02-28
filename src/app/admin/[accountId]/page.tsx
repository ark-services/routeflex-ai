import { requireAdmin } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ActionQuotaMeter } from "@/components/admin/action-quota-meter";

type ActionPeriod = {
  account_id: string;
  period_start: string;
  period_end: string;
  quota_units: number;
  used_units: number;
};

export default async function AdminOverviewPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const membership = await requireAdmin(accountId);
  const supabase = await createClient();

  // Get current billing period data
  const { data: period, error: periodError } = await supabase
    .rpc("get_or_create_action_period", { p_account_id: accountId })
    .returns<ActionPeriod>()
    .single();

  console.log('[AdminOverview] Period data:', period);

  if (periodError) {
    console.error('[AdminOverview] ❌ CRITICAL: Failed to fetch period data');
    console.error('[AdminOverview] Error:', periodError);
    console.error('[AdminOverview] Error details:', {
      message: periodError.message,
      details: periodError.details,
      hint: periodError.hint,
      code: periodError.code,
    });
    // This should NOT happen after migration 00036 - get_or_create_action_period is now SECURITY DEFINER
    throw new Error(`Failed to fetch billing period: ${periodError.message}`);
  }

  if (!period) {
    console.error('[AdminOverview] ❌ CRITICAL: Period data is null (should not happen)');
    throw new Error('Failed to fetch billing period: no data returned');
  }

  // First get all company IDs for this account
  const { data: companies } = await supabase
    .from("companies")
    .select("id")
    .eq("account_id", accountId);

  const companyIds = companies?.map(c => c.id) || [];

  // Count automations across all companies in this account
  const { count: automationCount } = await supabase
    .from("automations")
    .select("id", { count: "exact", head: true })
    .in("company_id", companyIds);

  // Use real period data (typed)
  const periodData: ActionPeriod = period;
  const actionsRemaining = periodData.quota_units - periodData.used_units;

  console.log('[AdminOverview] ✓ Period data loaded successfully:', {
    quota: periodData.quota_units,
    used: periodData.used_units,
    remaining: actionsRemaining,
    period_start: periodData.period_start,
    period_end: periodData.period_end,
  });

  // DEBUG: Get recent action executions from ledger
  const { data: recentActions } = await supabase
    .from("account_action_ledger")
    .select("id, occurred_at, units, source, status, metadata")
    .eq("account_id", accountId)
    .order("occurred_at", { ascending: false })
    .limit(10);

  // DEBUG: Get action count from automation_runs
  const { data: automationRuns } = await supabase
    .from("automation_runs")
    .select("id, created_at, status, actions_succeeded, actions_attempted, automation_id")
    .in("company_id", companyIds)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(10);

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-rf-text-primary">Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="text-sm font-medium text-rf-text-secondary mb-1">Automations</div>
          <div className="text-3xl font-semibold text-rf-text-primary">{automationCount ?? 0}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-rf-text-secondary mb-1">Actions Used</div>
          <div className="text-3xl font-semibold text-rf-text-primary">{periodData.used_units.toLocaleString()}</div>
          <div className="text-xs text-rf-text-muted mt-1">of {periodData.quota_units.toLocaleString()}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-rf-text-secondary mb-1">Actions Remaining</div>
          <div className={`text-3xl font-semibold ${actionsRemaining < 0 ? "text-rf-danger" : "text-rf-text-primary"}`}>
            {actionsRemaining.toLocaleString()}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-rf-text-primary mb-4">Action Quota</h2>
        <ActionQuotaMeter
          used={periodData.used_units}
          limit={periodData.quota_units}
          resetDate={periodData.period_end}
        />
        <div className="mt-4 text-xs text-rf-text-secondary">
          <div>Period: {new Date(periodData.period_start).toLocaleDateString()} - {new Date(periodData.period_end).toLocaleDateString()}</div>
          <div>Resets on: {new Date(periodData.period_end).toLocaleDateString()}</div>
        </div>
      </Card>

      {/* DEBUG SECTION: Recent Action Executions */}
      {isDev && (
        <>
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-rf-text-primary mb-4">
              🔧 Debug: Recent Action Ledger (Last 10)
            </h2>
            {recentActions && recentActions.length > 0 ? (
              <div className="space-y-2">
                {recentActions.map((action) => (
                  <div
                    key={action.id}
                    className="p-3 bg-rf-surface-page rounded border border-rf-border text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-rf-ink-500">
                        {new Date(action.occurred_at).toLocaleString()}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          action.status === 'completed'
                            ? 'bg-rf-success-bg text-rf-success'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {action.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-rf-ink-500">
                      <span>Units: {action.units}</span>
                      <span>Source: {action.source}</span>
                      {action.metadata?.automation_name && (
                        <span>Rule: {action.metadata.automation_name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-rf-text-secondary">No action executions recorded yet.</p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-sm font-semibold text-rf-text-primary mb-4">
              🔧 Debug: Recent Automation Runs (Last 10)
            </h2>
            {automationRuns && automationRuns.length > 0 ? (
              <div className="space-y-2">
                {automationRuns.map((run) => (
                  <div
                    key={run.id}
                    className="p-3 bg-rf-blue-tint rounded border border-rf-blue-tint text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-rf-blue">
                        {new Date(run.created_at).toLocaleString()}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rf-success-bg text-rf-success">
                        {run.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-rf-blue">
                      <span>Succeeded: {run.actions_succeeded || 0}</span>
                      <span>Attempted: {run.actions_attempted || 0}</span>
                      <span className="font-mono text-xs">ID: {run.automation_id?.slice(0, 8)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-rf-text-secondary">No automation runs yet.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
