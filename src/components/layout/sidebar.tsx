"use client";

import { useState, useTransition } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, LayoutDashboard, FileText, BookOpen, MoreVertical, LayoutGrid, ShieldAlert, GraduationCap, Settings } from "lucide-react";
import type { Job, Company } from "@/lib/types";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";
import { renameApplicantsBoard, duplicateApplicantsBoard, deleteApplicantsBoard } from "./board-actions";
import { renameJob, duplicateJob, deleteJob } from "./job-actions";
import { RenameModal } from "@/components/modals/rename-modal";
import { DeleteConfirmationModal } from "@/components/modals/delete-confirmation-modal";

interface SidebarProps {
  companyId: string;
  companies: Company[];
  jobs: Job[];
  canCreateJob: boolean;
  onCreateJob: () => void;
  userEmail?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  hasTemplateAccess?: boolean;
  hasLmsAccess?: boolean;
}

export function Sidebar({
  companyId,
  companies,
  jobs,
  canCreateJob,
  onCreateJob,
  userEmail,
  mobileOpen = false,
  onMobileClose,
  hasTemplateAccess = false,
  hasLmsAccess = false,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [jobSelectOpen, setJobSelectOpen] = useState(false);
  const [applicantsMenuOpen, setApplicantsMenuOpen] = useState(false);
  const [jobActionsMenuOpen, setJobActionsMenuOpen] = useState(false);
  const [renameJobModalOpen, setRenameJobModalOpen] = useState(false);
  const [deleteJobModalOpen, setDeleteJobModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  // Get current job ID from URL params
  const currentJobId = (params?.jobId as string) || null;

  // Active link detection
  const isOnApplicants =
    currentJobId !== null &&
    pathname?.endsWith("/applicants");
  const isOnForm =
    currentJobId !== null &&
    pathname?.endsWith("/form");
  const isOnKnowledgeBase =
    currentJobId !== null &&
    pathname?.endsWith("/knowledge-base");
  const isOnTemplateCenter = pathname?.includes("/template-center") ?? false;
  const isOnTraining = pathname?.includes("/training") ?? false;
  const isOnSettings = pathname?.includes("/settings") ?? false;
  const isSuperAdmin = userEmail === SUPER_ADMIN_EMAIL;

  const currentJob = jobs.find((j) => j.id === currentJobId);
  const hasJobs = jobs.length > 0;

  const handleJobChange = (jobId: string) => {
    setJobSelectOpen(false);
    router.push(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  };

  const handleRenameBoard = () => {
    const newName = prompt("Enter new name for the Applicants board:", "Applicants");
    if (!newName || newName.trim() === "") return;

    startTransition(async () => {
      const result = await renameApplicantsBoard(companyId, newName.trim());
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
      setApplicantsMenuOpen(false);
    });
  };

  const handleDuplicateBoard = () => {
    if (!confirm("Duplicate the Applicants board configuration (groups and columns)?")) return;

    startTransition(async () => {
      const result = await duplicateApplicantsBoard(companyId);
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
      setApplicantsMenuOpen(false);
    });
  };

  const handleDeleteBoard = () => {
    if (!confirm("Delete the Applicants board? This will remove all board configuration (groups, columns, and cell data). This cannot be undone.")) return;

    startTransition(async () => {
      const result = await deleteApplicantsBoard(companyId);
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
      setApplicantsMenuOpen(false);
    });
  };

  // Job Actions Handlers
  const handleRenameJobSubmit = async (newTitle: string) => {
    if (!currentJob) return { error: "No job selected" };
    return await renameJob(companyId, currentJob.id, newTitle);
  };

  const handleDuplicateJobClick = () => {
    if (!currentJob) return;
    if (!confirm(`Duplicate "${currentJob.title}"? This will copy the job structure (board and form) but NOT applicant data.`)) return;

    startTransition(async () => {
      const result = await duplicateJob(companyId, currentJob.id);
      if (result.error) {
        alert(result.error);
      } else if (result.success && result.jobId) {
        // Navigate to the new job
        router.push(`/dashboard/${companyId}/jobs/${result.jobId}/applicants`);
        router.refresh();
      }
      setJobActionsMenuOpen(false);
    });
  };

  const handleDeleteJobSubmit = async () => {
    if (!currentJob) return { error: "No job selected" };
    const result = await deleteJob(companyId, currentJob.id);
    if (result.success) {
      // After delete, redirect to first available job or company dashboard
      const remainingJobs = jobs.filter(j => j.id !== currentJob.id);
      if (remainingJobs.length > 0) {
        router.push(`/dashboard/${companyId}/jobs/${remainingJobs[0].id}/applicants`);
      } else {
        router.push(`/dashboard/${companyId}`);
      }
    }
    return result;
  };

  const sidebarContent = (
    <div className="w-[220px] border-r border-rf-border bg-rf-surface-card flex flex-col h-full group relative">

      {/* Collapse button — revealed on sidebar hover, floats top-right */}
      <button
        onClick={() => setCollapsed(true)}
        className="absolute top-2 right-2 p-1 hover:bg-rf-surface-page rounded transition opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto z-10"
        title="Collapse sidebar"
      >
        <ChevronLeft className="h-4 w-4 text-rf-text-muted" />
      </button>

      {/* Sidebar Content */}
      <div className="flex-1 overflow-y-auto py-3">

        {/* ── JOBS section ── */}
        <div className="flex items-center justify-between px-5 mb-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-rf-text-muted">Jobs</span>
          {canCreateJob && (
            <button
              onClick={onCreateJob}
              className="p-1 hover:bg-rf-surface-page rounded transition-colors"
              title="Create job"
            >
              <Plus className="h-4 w-4 text-rf-text-muted" />
            </button>
          )}
        </div>

        {/* Job Selector */}
        {hasJobs ? (
          <div className="relative group/job px-4 mb-0">
            {/* Main job selector button */}
            <button
              onClick={() => setJobSelectOpen(!jobSelectOpen)}
              className="w-full text-left rounded-lg border border-rf-border bg-rf-surface-page px-3 py-2 pr-8 text-sm font-semibold text-rf-ink-700 hover:bg-rf-ink-100 transition-colors flex items-center justify-between"
            >
              <span className="truncate">
                {currentJob?.title || "Select job"}
              </span>
              <ChevronDown className="h-4 w-4 text-rf-text-muted flex-shrink-0 ml-2" />
            </button>

            {/* Kebab button positioned absolutely */}
            {currentJob && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setJobActionsMenuOpen(!jobActionsMenuOpen);
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/job:opacity-100 p-1 hover:bg-rf-ink-100 rounded transition-opacity z-10"
                title="Job actions"
              >
                <MoreVertical className="h-3 w-3 text-rf-ink-500" />
              </button>
            )}

            {jobSelectOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setJobSelectOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1 w-full rounded-lg border border-rf-border bg-rf-surface-card shadow-rf-lg z-20 max-h-64 overflow-y-auto">
                  <div className="py-1">
                    {jobs.map((job) => (
                      <button
                        key={job.id}
                        onClick={() => handleJobChange(job.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          job.id === currentJobId
                            ? "bg-rf-ink-100 text-rf-text-primary font-medium"
                            : "text-rf-ink-700 hover:bg-rf-surface-page"
                        }`}
                      >
                        <div className="truncate">{job.title}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Job Actions Dropdown */}
            {jobActionsMenuOpen && currentJob && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setJobActionsMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-rf-border bg-rf-surface-card shadow-rf-lg z-20">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setRenameJobModalOpen(true);
                        setJobActionsMenuOpen(false);
                      }}
                      disabled={isPending}
                      className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors disabled:opacity-50"
                    >
                      Rename
                    </button>
                    <button
                      onClick={handleDuplicateJobClick}
                      disabled={isPending}
                      className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors disabled:opacity-50"
                    >
                      Duplicate
                    </button>
                    <div className="my-1 border-t border-rf-ink-100" />
                    <button
                      onClick={() => {
                        setDeleteJobModalOpen(true);
                        setJobActionsMenuOpen(false);
                      }}
                      disabled={isPending}
                      className="w-full text-left px-4 py-2 text-sm text-rf-danger hover:bg-rf-danger-bg transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-xs text-rf-text-muted px-5 py-2">
            No jobs yet
          </div>
        )}

        {/* Nested Navigation - Board + Form */}
        {hasJobs && currentJobId && (
          <div className="mt-2 space-y-0.5">
              {/* Applicants Board */}
              <div className="relative group/board">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    router.push(
                      `/dashboard/${companyId}/jobs/${currentJobId}/applicants`
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(
                        `/dashboard/${companyId}/jobs/${currentJobId}/applicants`
                      );
                    }
                  }}
                  className={`w-full text-left px-5 py-[9px] text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer select-none border-l-2 ${
                    isOnApplicants
                      ? "border-rf-blue bg-rf-blue-tint text-rf-blue"
                      : "border-transparent text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-page"
                  }`}
                >
                  <LayoutDashboard className={`h-4 w-4 flex-shrink-0 ${isOnApplicants ? "text-rf-blue" : "text-rf-text-muted"}`} />
                  <span className="flex-1">Board</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setApplicantsMenuOpen(!applicantsMenuOpen);
                    }}
                    className="opacity-0 group-hover/board:opacity-100 p-1 hover:bg-rf-ink-100 rounded transition-opacity"
                    title="More actions"
                    aria-haspopup="menu"
                    aria-expanded={applicantsMenuOpen}
                  >
                    <MoreVertical className="h-3 w-3 text-rf-ink-500" />
                  </button>
                </div>

                {/* Kebab Menu Dropdown */}
                {applicantsMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setApplicantsMenuOpen(false)}
                    />
                    <div className="absolute left-0 top-full mt-1 w-56 rounded-lg border border-rf-border bg-rf-surface-card shadow-rf-lg z-20">
                      <div className="py-1">
                        <button
                          onClick={handleRenameBoard}
                          disabled={isPending}
                          className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors disabled:opacity-50"
                        >
                          Rename
                        </button>
                        <button
                          onClick={handleDuplicateBoard}
                          disabled={isPending}
                          className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors disabled:opacity-50"
                        >
                          Duplicate
                        </button>
                        <div className="my-1 border-t border-rf-ink-100" />
                        <button
                          onClick={handleDeleteBoard}
                          disabled={isPending}
                          className="w-full text-left px-4 py-2 text-sm text-rf-danger hover:bg-rf-danger-bg transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Application Form */}
              <div
                role="button"
                tabIndex={0}
                onClick={() =>
                  router.push(
                    `/dashboard/${companyId}/jobs/${currentJobId}/form`
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(
                      `/dashboard/${companyId}/jobs/${currentJobId}/form`
                    );
                  }
                }}
                className={`w-full text-left px-5 py-[9px] text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer select-none border-l-2 ${
                  isOnForm
                    ? "border-rf-blue bg-rf-blue-tint text-rf-blue"
                    : "border-transparent text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-page"
                }`}
              >
                <FileText className={`h-4 w-4 flex-shrink-0 ${isOnForm ? "text-rf-blue" : "text-rf-text-muted"}`} />
                <span className="flex-1">Form</span>
              </div>

              {/* Knowledge Base */}
              <div
                role="button"
                tabIndex={0}
                onClick={() =>
                  router.push(
                    `/dashboard/${companyId}/jobs/${currentJobId}/knowledge-base`
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(
                      `/dashboard/${companyId}/jobs/${currentJobId}/knowledge-base`
                    );
                  }
                }}
                className={`w-full text-left px-5 py-[9px] text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer select-none border-l-2 ${
                  isOnKnowledgeBase
                    ? "border-rf-blue bg-rf-blue-tint text-rf-blue"
                    : "border-transparent text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-page"
                }`}
              >
                <BookOpen className={`h-4 w-4 flex-shrink-0 ${isOnKnowledgeBase ? "text-rf-blue" : "text-rf-text-muted"}`} />
                <span className="flex-1">Knowledge Base</span>
              </div>
            </div>
          )}

        {/* Divider */}
        <div className="my-3 mx-5 border-t border-rf-border" />

        {/* ── ACCOUNT section ── */}
        <div>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-rf-text-muted px-5 mb-1 block">Account</span>
          <div className="mt-1 space-y-0.5">
            {/* Template Center — only shown if plan includes template_access */}
            {hasTemplateAccess && (
              <button
                onClick={() => router.push(`/dashboard/${companyId}/template-center`)}
                className={`w-full text-left px-5 py-[9px] text-sm font-semibold transition-colors flex items-center gap-2 border-l-2 ${
                  isOnTemplateCenter
                    ? "border-rf-blue bg-rf-blue-tint text-rf-blue"
                    : "border-transparent text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-page"
                }`}
              >
                <LayoutGrid className={`h-4 w-4 flex-shrink-0 ${isOnTemplateCenter ? "text-rf-blue" : "text-rf-text-muted"}`} />
                Template Center
              </button>
            )}

            {/* Training — only shown if lms_enabled for this company */}
            {hasLmsAccess && (
              <button
                onClick={() => router.push(`/dashboard/${companyId}/training`)}
                className={`w-full text-left px-5 py-[9px] text-sm font-semibold transition-colors flex items-center gap-2 border-l-2 ${
                  isOnTraining
                    ? "border-rf-blue bg-rf-blue-tint text-rf-blue"
                    : "border-transparent text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-page"
                }`}
              >
                <GraduationCap className={`h-4 w-4 flex-shrink-0 ${isOnTraining ? "text-rf-blue" : "text-rf-text-muted"}`} />
                Training
              </button>
            )}

            {/* Settings */}
            <button
              onClick={() => router.push(`/dashboard/${companyId}/settings`)}
              className={`w-full text-left px-5 py-[9px] text-sm font-semibold transition-colors flex items-center gap-2 border-l-2 ${
                isOnSettings
                  ? "border-rf-blue bg-rf-blue-tint text-rf-blue"
                  : "border-transparent text-rf-ink-500 hover:text-rf-text-primary hover:bg-rf-surface-page"
              }`}
            >
              <Settings className={`h-4 w-4 flex-shrink-0 ${isOnSettings ? "text-rf-blue" : "text-rf-text-muted"}`} />
              Settings
            </button>

            {/* Super Admin link — only visible to super admin */}
            {isSuperAdmin && (
              <button
                onClick={() => router.push("/super-admin/templates")}
                className="w-full text-left px-5 py-[9px] text-sm font-semibold transition-colors flex items-center gap-2 border-l-2 border-transparent text-rf-text-muted hover:text-rf-text-primary hover:bg-rf-surface-page"
              >
                <ShieldAlert className="h-4 w-4 flex-shrink-0 text-rf-text-muted" />
                Super Admin
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Job Action Modals */}
      {currentJob && (
        <>
          <RenameModal
            open={renameJobModalOpen}
            onClose={() => setRenameJobModalOpen(false)}
            title="Rename Job"
            currentName={currentJob.title}
            onRename={handleRenameJobSubmit}
          />

          <DeleteConfirmationModal
            open={deleteJobModalOpen}
            onClose={() => setDeleteJobModalOpen(false)}
            title="Delete Job"
            description="This will permanently delete the job and all associated applicants, board data, and application forms."
            itemName={currentJob.title}
            confirmText="DELETE"
            onDelete={handleDeleteJobSubmit}
          />
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <div className="fixed inset-y-0 left-0 z-50 flex flex-col bg-rf-surface-card shadow-rf-xl overflow-y-auto">
            <div className="flex items-center justify-end px-4 py-3 border-b border-rf-border">
              <button
                onClick={onMobileClose}
                className="p-1.5 hover:bg-rf-surface-page rounded-lg transition-colors"
                aria-label="Close menu"
              >
                <ChevronLeft className="h-5 w-5 text-rf-text-muted" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop persistent sidebar (collapsed or expanded) */}
      {collapsed ? (
        <div className="hidden md:flex w-16 border-r border-rf-border bg-rf-surface-card flex-col items-center py-4">
          <button
            onClick={() => setCollapsed(false)}
            className="p-2 hover:bg-rf-surface-page rounded-lg transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="h-5 w-5 text-rf-text-muted" />
          </button>
        </div>
      ) : (
        <div className="hidden md:flex">
          {sidebarContent}
        </div>
      )}
    </>
  );
}
