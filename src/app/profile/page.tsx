import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StandaloneShell } from "@/components/layout/standalone-shell";
import { ProfileClient } from "./ProfileClient";
import { getNotificationPreferences } from "./actions";
import type { Company } from "@/lib/types";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get all companies user has access to (same query as dashboard layout)
  const { data: accountMemberships } = await supabase
    .from("account_memberships")
    .select("account_id, role")
    .eq("user_id", user.id);

  const accountIds = (accountMemberships ?? []).map((m) => m.account_id);

  const { data: companiesData } = await supabase
    .from("companies")
    .select("id, name, slug, account_id, lms_enabled, created_at")
    .in(
      "account_id",
      accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const companies = (companiesData ?? []) as Company[];
  const firstCompany = companies[0] ?? null;

  const roleByAccount = new Map(
    (accountMemberships ?? []).map((m) => [m.account_id, m.role] as const)
  );
  const accountId = firstCompany?.account_id as string | null ?? null;
  const userRole = accountId ? (roleByAccount.get(accountId as any) ?? "viewer") : "viewer";
  const isAdmin = userRole === "admin";

  const notificationPrefs = await getNotificationPreferences();
  const displayName = (user.user_metadata?.full_name as string) ?? "";
  const avatarUrl = (user.user_metadata?.avatar_url as string) ?? null;

  const backHref = firstCompany?.id ? `/dashboard/${firstCompany.id}` : "/";

  return (
    <StandaloneShell
      companies={companies}
      currentCompanyId={firstCompany?.id ?? ""}
      userEmail={user.email!}
      accountId={accountId}
      userRole={userRole}
      isAdmin={isAdmin}
      canCreateCompany={isAdmin}
    >
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Left panel */}
        <aside className="hidden md:flex flex-col w-56 flex-shrink-0 bg-rf-surface-card border-r border-rf-border min-h-[calc(100vh-3.5rem)]">
          <div className="sticky top-0 pt-4 px-3 pb-4">
            <Link
              href={backHref}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-page"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0 text-rf-text-muted" />
              Back to Board
            </Link>
          </div>
        </aside>
        {/* Mobile back button */}
        <div className="md:hidden px-4 pt-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-card"
          >
            <ArrowLeft className="w-4 h-4 flex-shrink-0 text-rf-text-muted" />
            Back to Board
          </Link>
        </div>
        <div className="flex-1 mx-auto w-full max-w-2xl px-6 sm:px-8">
          <ProfileClient
            email={user.email!}
            displayName={displayName}
            avatarUrl={avatarUrl}
            notificationPrefs={notificationPrefs}
          />
        </div>
      </div>
    </StandaloneShell>
  );
}
