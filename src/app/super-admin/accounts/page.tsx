import { createClient as createServiceClient } from "@supabase/supabase-js";
import { AccountsClient } from "./AccountsClient";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function SuperAdminAccountsPage() {
  const svc = getSvc();

  // Fetch all accounts
  const { data: accounts } = await svc
    .from("accounts")
    .select("id, name, plan_type, max_seats, created_at")
    .order("created_at", { ascending: false });

  // Fetch all plans for the selector
  const { data: plans } = await svc
    .from("subscription_plans")
    .select("id, name, max_seats")
    .order("price_cents", { ascending: true });

  // Enrich each account with: seats used, company count, and current period usage
  const enriched = await Promise.all(
    (accounts ?? []).map(async (acct) => {
      const [
        { count: seatsUsed },
        { count: companyCount },
        { data: periodRows },
      ] = await Promise.all([
        svc
          .from("account_memberships")
          .select("*", { count: "exact", head: true })
          .eq("account_id", acct.id),
        svc
          .from("companies")
          .select("*", { count: "exact", head: true })
          .eq("account_id", acct.id),
        svc.rpc("get_or_create_action_period", { p_account_id: acct.id }),
      ]);

      const period = Array.isArray(periodRows) ? periodRows[0] : null;

      return {
        ...acct,
        seats_used: seatsUsed ?? 0,
        company_count: companyCount ?? 0,
        actions_used: period?.used_units ?? 0,
        actions_quota: (period?.quota_units ?? 0) + (period?.extra_credits ?? 0),
        extra_credits: period?.extra_credits ?? 0,
      };
    })
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-rf-text-primary">Accounts</h1>
        <p className="text-sm text-rf-text-secondary mt-1">
          Manage subscription plans and action credits for all accounts.
        </p>
      </div>
      <AccountsClient accounts={enriched} plans={plans ?? []} />
    </div>
  );
}
