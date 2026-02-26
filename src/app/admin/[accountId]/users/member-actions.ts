"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Changes the role of a membership. Only account admins can call this. */
export async function changeMemberRole(
  accountId: string,
  membershipId: string,
  newRole: string
): Promise<{ error?: string }> {
  await requireAdmin(accountId);

  const validRoles = ["admin", "member", "viewer"];
  if (!validRoles.includes(newRole)) {
    return { error: "Invalid role" };
  }

  const svc = getSvc();

  // Confirm the membership actually belongs to this account
  const { data: membership, error: fetchError } = await svc
    .from("account_memberships")
    .select("id")
    .eq("id", membershipId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (fetchError || !membership) {
    return { error: "Membership not found" };
  }

  const { error } = await svc
    .from("account_memberships")
    .update({ role: newRole })
    .eq("id", membershipId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/${accountId}/users`);
  return {};
}

/** Removes a member from the account. Only account admins can call this. */
export async function removeMember(
  accountId: string,
  membershipId: string
): Promise<{ error?: string }> {
  await requireAdmin(accountId);

  const svc = getSvc();

  // Confirm the membership actually belongs to this account
  const { data: membership, error: fetchError } = await svc
    .from("account_memberships")
    .select("id, user_id")
    .eq("id", membershipId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (fetchError || !membership) {
    return { error: "Membership not found" };
  }

  const { error } = await svc
    .from("account_memberships")
    .delete()
    .eq("id", membershipId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/${accountId}/users`);
  return {};
}
