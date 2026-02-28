"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Wand2, AlertTriangle } from "lucide-react";
import type { Job } from "@/lib/types";
import { applyTemplate } from "../actions";

interface Props {
  templateId: string;
  companyId: string;
  jobs: Job[];
  preselectedJobId?: string;
}

export function UseTemplatePanel({
  templateId,
  companyId,
  jobs,
  preselectedJobId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedJobId, setSelectedJobId] = useState(preselectedJobId ?? "");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);
  const [alreadyApplied, setAlreadyApplied] = useState<{
    show: boolean;
    appliedAt?: string;
  }>({ show: false });

  const showToast = (
    message: string,
    type: "success" | "error" | "warning",
    duration = 4000
  ) => {
    setToast({ message, type });
    if (duration > 0) setTimeout(() => setToast(null), duration);
  };

  const doApply = (force: boolean) => {
    if (!selectedJobId) {
      showToast("Please select a job first.", "error");
      return;
    }

    startTransition(async () => {
      try {
        const result = await applyTemplate(templateId, selectedJobId, companyId, force);

        if ("error" in result && result.error) {
          showToast(result.error, "error");
          return;
        }

        if ("alreadyApplied" in result && result.alreadyApplied) {
          setAlreadyApplied({ show: true, appliedAt: result.appliedAt });
          return;
        }

        if ("success" in result && result.success && result.redirectUrl) {
          showToast(
            `Template applied! Created ${result.groupsCreated} group${
              result.groupsCreated !== 1 ? "s" : ""
            }.`,
            "success",
            0
          );
          setTimeout(() => router.push(result.redirectUrl!), 800);
        }
      } catch (err) {
        showToast((err as Error).message, "error");
      }
    });
  };

  const handleApply = () => {
    setAlreadyApplied({ show: false });
    doApply(false);
  };

  const handleForceApply = () => {
    setAlreadyApplied({ show: false });
    doApply(true);
  };

  const openJobs = jobs.filter((j) => j.status !== "closed");

  return (
    <div className="sticky top-6">
      <div className="bg-rf-surface-card border border-rf-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-rf-text-primary">Use this template</h2>

        {/* Job picker */}
        <div>
          <label className="block text-xs font-medium text-rf-text-secondary mb-1.5">
            Apply to job
          </label>
          {jobs.length === 0 ? (
            <p className="text-xs text-rf-text-muted">
              No jobs found.{" "}
              <button
                onClick={() => router.push(`/dashboard/${companyId}`)}
                className="text-rf-blue hover:underline"
              >
                Create a job first.
              </button>
            </p>
          ) : (
            <select
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                setAlreadyApplied({ show: false });
              }}
              className="w-full rounded-lg border border-rf-border px-3 py-2 text-sm text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue bg-rf-surface-card"
            >
              <option value="">Select a job…</option>
              <optgroup label="Open jobs">
                {openJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </optgroup>
              {jobs.some((j) => j.status === "closed") && (
                <optgroup label="Closed jobs">
                  {jobs
                    .filter((j) => j.status === "closed")
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          )}
        </div>

        {/* Already-applied warning */}
        {alreadyApplied.show && (
          <div className="p-3 bg-rf-warning-bg border border-amber-200 rounded-lg text-xs text-rf-warning space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                This template was already applied to this job on{" "}
                {alreadyApplied.appliedAt
                  ? new Date(alreadyApplied.appliedAt).toLocaleDateString()
                  : "a previous date"}
                . Applying again will add duplicate groups.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleForceApply}
                disabled={isPending}
                className="flex-1 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                Apply anyway
              </button>
              <button
                onClick={() => setAlreadyApplied({ show: false })}
                className="flex-1 py-1.5 text-xs text-rf-ink-500 border border-rf-border rounded-md hover:bg-rf-surface-page transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
              toast.type === "success"
                ? "bg-rf-success-bg border border-green-200 text-rf-success"
                : toast.type === "warning"
                ? "bg-rf-warning-bg border border-amber-200 text-rf-warning"
                : "bg-rf-danger-bg border border-red-200 text-rf-danger"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            ) : toast.type === "warning" ? (
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 flex-shrink-0" />
            )}
            {toast.message}
          </div>
        )}

        {/* CTA button */}
        {!alreadyApplied.show && (
          <button
            onClick={handleApply}
            disabled={isPending || !selectedJobId}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Applying…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Use template
              </>
            )}
          </button>
        )}

        <p className="text-xs text-rf-text-muted leading-relaxed">
          Groups and rows from this template will be added to your selected job's board.
          Your existing board data will not be changed.
        </p>
      </div>
    </div>
  );
}
