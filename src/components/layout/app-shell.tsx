"use client";

import { useState, useEffect } from "react";
import { TopBar } from "./top-bar";
import { Sidebar } from "./sidebar";
import { CreateCompanyModal } from "./create-company-modal";
import { CreateJobModal } from "./create-job-modal";
import {
  AutomationToastStack,
  emitAutomationRunning,
  emitAutomationCompleted,
  emitAutomationFailed,
} from "@/components/ui/automation-toast-stack";
import { createClient } from "@/lib/supabase/client";
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
  hasTemplateAccess: boolean;
  hasLmsAccess: boolean;
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
  hasTemplateAccess,
  hasLmsAccess,
  children,
}: AppShellProps) {
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Subscribe to automation_runs inserts via Supabase Realtime.
  // When a non-skipped run is inserted the automation actually executed —
  // emit the "automation:running" event so the toast stack can display it.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`automation-runs-${currentCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "automation_runs",
          filter: `company_id=eq.${currentCompanyId}`,
        },
        (event) => {
          const run = event.new as {
            status: string;
            error?: string | null;
            payload?: { _automation_name?: string | null };
          };
          // Only show toast for runs that actually executed (not filtered/skipped)
          if (run.status === "skipped") return;
          const name = run.payload?._automation_name ?? "";
          // Immediately show "Automation Running"
          emitAutomationRunning(name);
          // After 1.5 s, show completion or failure
          const runStatus = run.status;
          const runError = run.error ?? null;
          setTimeout(() => {
            if (runStatus === "success") {
              emitAutomationCompleted(name);
            } else if (runStatus === "failed") {
              emitAutomationFailed(name, runError);
            }
          }, 1500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentCompanyId]);

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
        onMenuOpen={() => setMobileSidebarOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          companyId={currentCompanyId}
          companies={companies}
          jobs={jobs}
          canCreateJob={canCreateJob}
          onCreateJob={() => setShowCreateJob(true)}
          userEmail={userEmail}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          hasTemplateAccess={hasTemplateAccess}
          hasLmsAccess={hasLmsAccess}
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

      <AutomationToastStack />
    </div>
  );
}
