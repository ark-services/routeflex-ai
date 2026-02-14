import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type Role = "admin" | "member" | "viewer";

export async function getCurrentAccountMembership(accountId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role, accounts!inner(id, name, plan_type, max_seats)")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .single();

  if (!membership) return null;

  const account = Array.isArray(membership.accounts) ? membership.accounts[0] : membership.accounts;

  return {
    userId: user.id,
    accountId,
    role: membership.role as Role,
    account: account as { id: string; name: string; plan_type: string; max_seats: number }
  };
}

export async function requireAdmin(accountId: string) {
  const membership = await getCurrentAccountMembership(accountId);
  if (!membership || membership.role !== "admin") {
    redirect("/");
  }
  return membership;
}

export async function requireMemberOrAbove(accountId: string) {
  const membership = await getCurrentAccountMembership(accountId);
  if (!membership || membership.role === "viewer") {
    redirect("/");
  }
  return membership;
}

export function canEditBoards(role: Role): boolean {
  return role === "admin" || role === "member";
}

export function canEditAutomations(role: Role, accountLocked: boolean): boolean {
  if (accountLocked) return false;
  return role === "admin" || role === "member";
}
