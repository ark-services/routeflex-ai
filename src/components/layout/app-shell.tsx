"use client";

import { useState } from "react";
import { TopBar } from "./top-bar";
import { Sidebar } from "./sidebar";
import { CreateCompanyModal } from "./create-company-modal";
import { CreateJobModal } from "./create-job-modal";
import type { Company, Job } from "@/lib/types";

interface AppShellProps {
  companies: Company[];
  currentCompanyId: string;
  jobs: Job[];
  userEmail: string;
  accountId: string | null;
  userRole: string;
  isAdmin: boolean;
  canCreateCompany: boolean;
  canCreateJob: boolean;
  children: React.ReactNode;
}

export function AppShell({
  companies,
  currentCompanyId,
  jobs,
  userEmail,
  accountId,
  userRole,
  isAdmin,
  canCreateCompany,
  canCreateJob,
  children,
}: AppShellProps) {
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-stone-50">
      <TopBar
        companies={companies}
        currentCompanyId={currentCompanyId}
        userEmail={userEmail}
        accountId={accountId}
        userRole={userRole}
        isAdmin={isAdmin}
        canCreateCompany={canCreateCompany}
        onCreateCompany={() => setShowCreateCompany(true)}
        onMenuOpen={() => setMobileSidebarOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          companyId={currentCompanyId}
          companies={companies}
          jobs={jobs}
          canCreateJob={canCreateJob}
          onCreateJob={() => setShowCreateJob(true)}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <main className="flex-1 overflow-auto min-w-0 min-h-0">
          {children}
        </main>
      </div>

      <CreateCompanyModal
        open={showCreateCompany}
        onClose={() => setShowCreateCompany(false)}
        accountId={accountId || ""}
      />

      <CreateJobModal
        open={showCreateJob}
        onClose={() => setShowCreateJob(false)}
        companyId={currentCompanyId}
      />
    </div>
  );
}
