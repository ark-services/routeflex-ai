import { requireAdmin } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { UsersPageClient } from "@/components/admin/users-page-client";

export default async function AdminUsersPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const membership = await requireAdmin(accountId);
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("account_memberships")
    .select("id, user_id, role, created_at, users:user_id(email)")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  const { count: memberCount } = await supabase
    .from("account_memberships")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId);

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
    />
  );
}
