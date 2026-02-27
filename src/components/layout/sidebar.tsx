"use client";

import { useState, useTransition } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, LayoutDashboard, FileText, MoreVertical, LayoutGrid, ShieldAlert, GraduationCap, Settings } from "lucide-react";
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
    <div className="w-64 border-r border-stone-200 bg-stone-50/50 flex flex-col h-full group">
      {/* Sidebar Header — collapse arrow only, revealed on sidebar hover */}
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-stone-200 min-h-[36px]">
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 hover:bg-stone-100 rounded transition opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          title="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4 text-stone-600" />
        </button>
      </div>

      {/* Sidebar Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* Top-level navigation */}
        <div className="space-y-1">
          {/* Template Center — only shown if plan includes template_access */}
          {hasTemplateAccess && (
            <button
              onClick={() => router.push(`/dashboard/${companyId}/template-center`)}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
                isOnTemplateCenter
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              <LayoutGrid className={`h-4 w-4 ${isOnTemplateCenter ? "text-blue-600" : "text-stone-500"}`} />
              Template Center
            </button>
          )}

          {/* Training — only shown if lms_enabled for this company */}
          {hasLmsAccess && (
            <button
              onClick={() => router.push(`/dashboard/${companyId}/training`)}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
                isOnTraining
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              <GraduationCap className={`h-4 w-4 ${isOnTraining ? "text-blue-600" : "text-stone-500"}`} />
              Training
            </button>
          )}

          {/* Settings */}
          <button
            onClick={() => router.push(`/dashboard/${companyId}/settings`)}
            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
              isOnSettings
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-stone-700 hover:bg-stone-100"
            }`}
          >
            <Settings className={`h-4 w-4 ${isOnSettings ? "text-blue-600" : "text-stone-500"}`} />
            Settings
          </button>

          {/* Super Admin link — only visible to super admin */}
          {isSuperAdmin && (
            <button
              onClick={() => router.push("/super-admin/templates")}
              className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 text-stone-600 hover:bg-stone-100"
            >
              <ShieldAlert className="h-4 w-4" />
              Super Admin
            </button>
          )}
        </div>

        {/* Jobs Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Jobs
            </h3>
            {canCreateJob && (
              <button
                onClick={onCreateJob}
                className="p-1 hover:bg-stone-100 rounded transition-colors"
                title="Create job"
              >
                <Plus className="h-4 w-4 text-stone-600" />
              </button>
            )}
          </div>

          {/* Job Selector */}
          {hasJobs ? (
            <div className="relative group">
              {/* Main job selector button */}
              <button
                onClick={() => setJobSelectOpen(!jobSelectOpen)}
                className="w-full text-left rounded-lg border border-stone-200 bg-white px-3 py-2 pr-10 text-sm text-stone-700 hover:bg-stone-50 transition-colors flex items-center justify-between"
              >
                <span className="truncate">
                  {currentJob?.title || "Select job"}
                </span>
                <ChevronDown className="h-4 w-4 text-stone-400 flex-shrink-0 ml-2" />
              </button>

              {/* Kebab button positioned absolutely */}
              {currentJob && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setJobActionsMenuOpen(!jobActionsMenuOpen);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-stone-200 rounded transition-opacity z-10"
                  title="Job actions"
                >
                  <MoreVertical className="h-3 w-3 text-stone-600" />
                </button>
              )}

              {jobSelectOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setJobSelectOpen(false)}
                  />
                  <div className="absolute left-0 top-full mt-1 w-full rounded-lg border border-stone-200 bg-white shadow-lg z-20 max-h-64 overflow-y-auto">
                    <div className="py-1">
                      {jobs.map((job) => (
                        <button
                          key={job.id}
                          onClick={() => handleJobChange(job.id)}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            job.id === currentJobId
                              ? "bg-stone-100 text-stone-900 font-medium"
                              : "text-stone-700 hover:bg-stone-50"
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
                  <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-stone-200 bg-white shadow-lg z-20">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setRenameJobModalOpen(true);
                          setJobActionsMenuOpen(false);
                        }}
                        disabled={isPending}
                        className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
                      >
                        Rename
                      </button>
                      <button
                        onClick={handleDuplicateJobClick}
                        disabled={isPending}
                        className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
                      >
                        Duplicate
                      </button>
                      <div className="my-1 border-t border-stone-100" />
                      <button
                        onClick={() => {
                          setDeleteJobModalOpen(true);
                          setJobActionsMenuOpen(false);
                        }}
                        disabled={isPending}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-xs text-stone-400 px-3 py-2">
              No jobs yet
            </div>
          )}

          {/* Nested Navigation - Applicants Board + Application Form */}
          {hasJobs && currentJobId && (
            <div className="ml-3 mt-2 space-y-1">
              {/* Applicants Board */}
              <div className="relative group">
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
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 cursor-pointer select-none ${
                    isOnApplicants
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  <LayoutDashboard className={`h-4 w-4 ${isOnApplicants ? "text-blue-600" : "text-stone-500"}`} />
                  <span className="flex-1">Applicants Board</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setApplicantsMenuOpen(!applicantsMenuOpen);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-stone-200 rounded transition-opacity"
                    title="More actions"
                    aria-haspopup="menu"
                    aria-expanded={applicantsMenuOpen}
                  >
                    <MoreVertical className="h-3 w-3 text-stone-600" />
                  </button>
                </div>

                {/* Kebab Menu Dropdown */}
                {applicantsMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setApplicantsMenuOpen(false)}
                    />
                    <div className="absolute left-0 top-full mt-1 w-56 rounded-lg border border-stone-200 bg-white shadow-lg z-20">
                      <div className="py-1">
                        <button
                          onClick={handleRenameBoard}
                          disabled={isPending}
                          className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
                        >
                          Rename
                        </button>
                        <button
                          onClick={handleDuplicateBoard}
                          disabled={isPending}
                          className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
                        >
                          Duplicate
                        </button>
                        <div className="my-1 border-t border-stone-100" />
                        <button
                          onClick={handleDeleteBoard}
                          disabled={isPending}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
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
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 cursor-pointer select-none ${
                  isOnForm
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                <FileText className={`h-4 w-4 ${isOnForm ? "text-blue-600" : "text-stone-500"}`} />
                <span className="flex-1">Application Form</span>
              </div>
            </div>
          )}
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
          <div className="fixed inset-y-0 left-0 z-50 flex flex-col bg-stone-50 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-end px-4 py-3 border-b border-stone-200">
              <button
                onClick={onMobileClose}
                className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors"
                aria-label="Close menu"
              >
                <ChevronLeft className="h-5 w-5 text-stone-600" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop persistent sidebar (collapsed or expanded) */}
      {collapsed ? (
        <div className="hidden md:flex w-16 border-r border-stone-200 bg-stone-50/50 flex-col items-center py-4">
          <button
            onClick={() => setCollapsed(false)}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="h-5 w-5 text-stone-600" />
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
