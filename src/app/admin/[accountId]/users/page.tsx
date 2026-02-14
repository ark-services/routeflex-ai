import { requireAdmin } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { UserInviteForm } from "@/components/admin/user-invite-form";
import { MemberListTable } from "@/components/admin/member-list-table";

export default async function AdminUsersPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const membership = await requireAdmin(accountId);
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("account_memberships")
    .select("id, user_id, role, created_at, users:user_id(email)")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  const { count: memberCount } = await supabase.from("account_memberships").select("*", { count: "exact", head: true }).eq("account_id", accountId);

  const canInviteMore = (memberCount ?? 0) < membership.account.max_seats;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-stone-900 mb-4">Invite Team Member</h2>
        {!canInviteMore && <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          Seat limit reached ({memberCount} / {membership.account.max_seats})
        </div>}
        <UserInviteForm accountId={accountId} disabled={!canInviteMore} />
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-stone-900 mb-4">Team Members ({members?.length ?? 0} / {membership.account.max_seats})</h2>
        <MemberListTable members={members ?? []} accountId={accountId} currentUserId={membership.userId} currentUserRole={membership.role} />
      </Card>
    </div>
  );
}
