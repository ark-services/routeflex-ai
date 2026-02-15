import Link from "next/link";
import { CompanySelect } from "./company-select";
import { UserMenu } from "./user-menu";
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
}: TopBarProps) {
  return (
    <header className="h-16 border-b border-stone-200 bg-white flex items-center justify-between px-6">
      <Link
        href="/"
        className="text-lg font-semibold tracking-tight text-stone-900 hover:text-stone-700 transition-colors"
      >
        RouteFlex AI
      </Link>

      <div className="flex items-center gap-4">
        <CompanySelect
          companies={companies}
          currentCompanyId={currentCompanyId}
          canCreateCompany={canCreateCompany}
          onCreateCompany={onCreateCompany}
          accountId={accountId || ""}
          userRole={userRole}
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
