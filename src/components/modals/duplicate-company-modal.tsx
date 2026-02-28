"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";

interface DuplicateCompanyModalProps {
  open: boolean;
  onClose: () => void;
  companyName: string;
  onDuplicate: (includeJobs: boolean) => Promise<{ success?: boolean; error?: string; companyId?: string }>;
  onSuccess?: (companyId?: string) => void;
}

export function DuplicateCompanyModal({
  open,
  onClose,
  companyName,
  onDuplicate,
  onSuccess
}: DuplicateCompanyModalProps) {
  const [includeJobs, setIncludeJobs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDuplicate = () => {
    startTransition(async () => {
      const result = await onDuplicate(includeJobs);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
        onSuccess?.(result.companyId);
        onClose();
      }
    });
  };

  const handleClose = () => {
    setIncludeJobs(false);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate Company</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-rf-ink-700">
            Create a copy of <span className="font-semibold">{companyName}</span>
          </p>

          <div className="bg-rf-blue-tint border border-rf-blue-tint rounded-lg p-4">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-rf-blue flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-blue-900">
                  Applicant data will <span className="font-semibold">not</span> be copied. Only the company structure and optionally job listings (without applicants) will be duplicated.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="includeJobs"
              checked={includeJobs}
              onChange={(e) => setIncludeJobs(e.target.checked)}
              className="mt-1 h-4 w-4 text-rf-blue border-rf-ink-100 rounded focus:ring-rf-blue"
              disabled={isPending}
            />
            <label htmlFor="includeJobs" className="text-sm text-rf-ink-700 cursor-pointer">
              <span className="font-medium">Include job listings (structure only)</span>
              <p className="text-rf-text-secondary mt-1">
                Copy job titles and descriptions. Jobs will start in "paused" status with zero applicants.
              </p>
            </label>
          </div>

          {error && (
            <div className="bg-rf-danger-bg border border-red-200 text-rf-danger px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={handleClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-rf-ink-700 bg-rf-surface-card border border-rf-ink-100 rounded-lg hover:bg-rf-surface-page disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleDuplicate}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-rf-blue rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Duplicating..." : "Duplicate"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
