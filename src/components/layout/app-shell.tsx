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
  isAdmin,
  canCreateCompany,
  canCreateJob,
  children,
}: AppShellProps) {
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [showCreateJob, setShowCreateJob] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <TopBar
        companies={companies}
        currentCompanyId={currentCompanyId}
        userEmail={userEmail}
        accountId={accountId}
        isAdmin={isAdmin}
        canCreateCompany={canCreateCompany}
        onCreateCompany={() => setShowCreateCompany(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          companyId={currentCompanyId}
          companies={companies}
          jobs={jobs}
          canCreateJob={canCreateJob}
          onCreateJob={() => setShowCreateJob(true)}
        />

        <main className="flex-1 overflow-auto">
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
