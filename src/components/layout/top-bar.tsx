import Link from "next/link";
import { Menu } from "lucide-react";
import { RouteFlexLogo } from "@/components/ui/routeflex-logo";
import { CompanySelect } from "./company-select";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { Company } from "@/lib/types";

interface TopBarProps {
  companies: Company[];
  currentCompanyId: string;
  userEmail: string;
  accountId: string | null;
  userRole: string;
  isAdmin: boolean;
  canCreateCompany: boolean;
  onCreateCompany: () => void;
  onMenuOpen?: () => void;
}

export function TopBar({
  companies,
  currentCompanyId,
  userEmail,
  accountId,
  userRole,
  isAdmin,
  canCreateCompany,
  onCreateCompany,
  onMenuOpen,
}: TopBarProps) {
  return (
    <header className="h-12 border-b border-rf-border bg-rf-surface-card flex items-center justify-between px-4 md:px-5 flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Hamburger – mobile only */}
        {onMenuOpen && (
          <button
            onClick={onMenuOpen}
            className="md:hidden p-1.5 hover:bg-rf-surface-page rounded-lg transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5 text-rf-ink-500" />
          </button>
        )}
        <Link href="/dashboard">
          <RouteFlexLogo size="nav" />
        </Link>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {accountId && (
          <NotificationBell companyId={currentCompanyId} accountId={accountId} />
        )}
        <CompanySelect
          companies={companies}
          currentCompanyId={currentCompanyId}
          canCreateCompany={canCreateCompany}
          onCreateCompany={onCreateCompany}
          accountId={accountId || ""}
          userRole={userRole}
          variant="light"
        />
        <UserMenu
          userEmail={userEmail}
          accountId={accountId}
          isAdmin={isAdmin}
        />
      </div>
    </header>
  );
}
