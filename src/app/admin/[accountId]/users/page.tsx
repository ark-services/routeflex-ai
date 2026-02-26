import { requireAdmin } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { UsersPageClient } from "@/components/admin/users-page-client";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const membership = await requireAdmin(accountId);
  const supabase = await createClient();
  const svc = getSvc();

  const [{ data: members }, { count: memberCount }, { data: linkRow }] =
    await Promise.all([
      supabase
        .from("account_memberships")
        .select("id, user_id, role, created_at, users:user_id(email)")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true }),

      supabase
        .from("account_memberships")
        .select("*", { count: "exact", head: true })
        .eq("account_id", accountId),

      // Pre-load the most recent active member invite link
      svc
        .from("account_invite_links")
        .select("token")
        .eq("account_id", accountId)
        .eq("role", "member")
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const canInviteMore = (memberCount ?? 0) < membership.account.max_seats;

  return (
    <UsersPageClient
      accountId={accountId}
      members={members ?? []}
      currentUserId={membership.userId}
      currentUserRole={membership.role}
      canInviteMore={canInviteMore}
      memberCount={memberCount ?? 0}
      maxSeats={membership.account.max_seats}
      initialInviteLinkToken={linkRow?.token ?? null}
    />
  );
}
