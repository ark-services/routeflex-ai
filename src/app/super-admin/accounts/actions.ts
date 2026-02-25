"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import { revalidatePath } from "next/cache";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function assertSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    throw new Error("Unauthorized");
  }
}

export async function changePlan(accountId: string, newPlan: string) {
  await assertSuperAdmin();
  const svc = getSvc();

  // Validate plan exists
  const { data: plan } = await svc
    .from("subscription_plans")
    .select("id")
    .eq("id", newPlan)
    .single();

  if (!plan) return { error: "Invalid plan" };

  const { error } = await svc
    .from("accounts")
    .update({ plan_type: newPlan, updated_at: new Date().toISOString() })
    .eq("id", accountId);

  if (error) return { error: error.message };

  revalidatePath("/super-admin/accounts");
  return { success: true };
}

export async function addExtraCredits(accountId: string, creditsToAdd: number) {
  await assertSuperAdmin();
  if (!creditsToAdd || creditsToAdd <= 0) return { error: "Credits must be a positive number" };

  const svc = getSvc();

  // Ensure the current billing period row exists
  await svc.rpc("get_or_create_action_period", { p_account_id: accountId });

  // Get current period_start via get_billing_period
  const { data: bp } = await svc.rpc("get_billing_period", {
    p_account_id: accountId,
    p_at_date: new Date().toISOString(),
  });
  const periodStart = Array.isArray(bp) ? bp[0]?.period_start : null;
  if (!periodStart) return { error: "Could not determine billing period" };

  // Read current extra_credits then increment (read-modify-write; safe for single-admin UI)
  const { data: current, error: readError } = await svc
    .from("account_action_periods")
    .select("extra_credits")
    .eq("account_id", accountId)
    .eq("period_start", periodStart)
    .single();

  if (readError) return { error: readError.message };

  const newCredits = (current?.extra_credits ?? 0) + creditsToAdd;

  const { error: updateError } = await svc
    .from("account_action_periods")
    .update({ extra_credits: newCredits, updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("period_start", periodStart);

  if (updateError) return { error: updateError.message };

  revalidatePath("/super-admin/accounts");
  return { success: true };
}
