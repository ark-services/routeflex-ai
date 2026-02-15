"use client";

import { useState, useTransition } from "react";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, LayoutDashboard, MoreVertical } from "lucide-react";
import type { Job, Company } from "@/lib/types";
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
}

export function Sidebar({
  companyId,
  companies,
  jobs,
  canCreateJob,
  onCreateJob,
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

  // Get current job ID from URL params
  const currentJobId = (params?.jobId as string) || null;

  const currentJob = jobs.find((j) => j.id === currentJobId);
  const hasJobs = jobs.length > 0;

  const handleJobChange = (jobId: string) => {
    setJobSelectOpen(false);
    router.push(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  };

  const handleViewApplicationPage = () => {
    if (!currentJob) return;

    // Navigate to the Application Form page where the Share Form button is
    router.push(`/dashboard/${companyId}/jobs/${currentJobId}/form`);
    setApplicantsMenuOpen(false);
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

  if (collapsed) {
    return (
      <div className="w-16 border-r border-stone-200 bg-stone-50/50 flex flex-col items-center py-4">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight className="h-5 w-5 text-stone-600" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-stone-200 bg-stone-50/50 flex flex-col">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-stone-200">
        <h2 className="text-sm font-semibold text-stone-900">Navigation</h2>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 hover:bg-stone-100 rounded transition-colors"
          title="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4 text-stone-600" />
        </button>
      </div>

      {/* Sidebar Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
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

          {/* Nested Navigation - Applicants */}
          {hasJobs && currentJobId && (
            <div className="ml-3 mt-2 space-y-1">
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
                  className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-lg transition-colors flex items-center gap-2 cursor-pointer select-none"
                >
                  <LayoutDashboard className="h-4 w-4 text-stone-500" />
                  <span className="flex-1">Applicants</span>
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
                          onClick={handleViewApplicationPage}
                          disabled={isPending}
                          className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
                        >
                          View application page
                        </button>
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
}
