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

  // Use service role for member fetches — the regular client's JOIN to auth.users
  // (for emails) is blocked by PostgREST and silently drops all rows.
  const [{ data: memberships }, { count: memberCount }, { data: linkRow }] =
    await Promise.all([
      svc
        .from("account_memberships")
        .select("id, user_id, role, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true }),

      svc
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

  // Fetch emails from auth.users via the admin API (service role only)
  const userIds = (memberships ?? []).map((m) => m.user_id as string);
  const emailByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: { users: authUsers } } = await svc.auth.admin.listUsers({
      perPage: 1000,
    });
    for (const au of authUsers ?? []) {
      if (userIds.includes(au.id)) {
        emailByUserId.set(au.id, au.email ?? "");
      }
    }
  }

  // Shape members to match the format the client component expects
  const members = (memberships ?? []).map((m) => ({
    ...m,
    users: { email: emailByUserId.get(m.user_id as string) ?? "" },
  }));

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
