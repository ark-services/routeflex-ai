"use client";

import { useState } from "react";
import { TopBar } from "./top-bar";
import { CreateCompanyModal } from "./create-company-modal";
import type { Company } from "@/lib/types";

interface StandaloneShellProps {
  companies: Company[];
  currentCompanyId: string;
  userEmail: string;
  accountId: string | null;
  userRole: string;
  isAdmin: boolean;
  canCreateCompany: boolean;
  children: React.ReactNode;
}

export function StandaloneShell({
  companies,
  currentCompanyId,
  userEmail,
  accountId,
  userRole,
  isAdmin,
  canCreateCompany,
  children,
}: StandaloneShellProps) {
  const [showCreateCompany, setShowCreateCompany] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-rf-surface-page">
      <TopBar
        companies={companies}
        currentCompanyId={currentCompanyId}
        userEmail={userEmail}
        accountId={accountId}
        userRole={userRole}
        isAdmin={isAdmin}
        canCreateCompany={canCreateCompany}
        onCreateCompany={() => setShowCreateCompany(true)}
      />
      <div className="flex-1 overflow-auto">
        {children}
      </div>
      <CreateCompanyModal
        open={showCreateCompany}
        onClose={() => setShowCreateCompany(false)}
        accountId={accountId || ""}
      />
    </div>
  );
}
