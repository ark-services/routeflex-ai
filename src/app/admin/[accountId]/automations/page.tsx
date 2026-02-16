import { requireAdmin } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { DailyActionChart } from "@/components/admin/daily-action-chart";

type ActionPeriod = {
  account_id: string;
  period_start: string;
  period_end: string;
  quota_units: number;
  used_units: number;
};

type DailyActionData = {
  date: string;
  actions: number;
};

export default async function AdminAutomationsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  await requireAdmin(accountId);
  const supabase = await createClient();

  // Get current period data
  const { data: periodData } = await supabase
    .rpc("get_or_create_action_period", { p_account_id: accountId })
    .returns<ActionPeriod>()
    .single();

  const period = periodData as ActionPeriod | null;

  const actionsUsed = period?.used_units ?? 0;
  const quotaUnits = period?.quota_units ?? 0;
  const actionsRemaining = quotaUnits - actionsUsed;

  // Get daily action data for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: dailyActions } = await supabase
    .from("account_action_ledger")
    .select("occurred_at, units")
    .eq("account_id", accountId)
    .eq("status", "completed")
    .gte("occurred_at", thirtyDaysAgo.toISOString())
    .order("occurred_at", { ascending: true });

  // Aggregate by day
  const actionsByDay = new Map<string, number>();

  // Initialize all days in the last 30 days with 0
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    actionsByDay.set(dateStr, 0);
  }

  // Add actual action counts
  dailyActions?.forEach((action) => {
    const dateStr = action.occurred_at.split("T")[0];
    const current = actionsByDay.get(dateStr) || 0;
    actionsByDay.set(dateStr, current + action.units);
  });

  // Convert to array for chart
  const chartData: DailyActionData[] = Array.from(actionsByDay.entries()).map(([date, actions]) => ({
    date,
    actions,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Automations</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="text-sm font-medium text-stone-500 mb-1">Actions Used</div>
          <div className="text-3xl font-semibold text-stone-900">{actionsUsed.toLocaleString()}</div>
          <div className="text-xs text-stone-400 mt-1">of {quotaUnits.toLocaleString()}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-stone-500 mb-1">Actions Remaining</div>
          <div className={`text-3xl font-semibold ${actionsRemaining < 0 ? "text-red-600" : "text-stone-900"}`}>
            {actionsRemaining.toLocaleString()}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-stone-500 mb-1">Total Quota</div>
          <div className="text-3xl font-semibold text-stone-900">{quotaUnits.toLocaleString()}</div>
          <div className="text-xs text-stone-400 mt-1">per billing period</div>
        </Card>
      </div>

      {/* Daily Action Usage Chart */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-stone-900 mb-6">Daily action use</h2>
        <DailyActionChart data={chartData} />
      </Card>
    </div>
  );
}
