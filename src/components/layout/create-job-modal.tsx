"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addJob } from "@/app/dashboard/[companyId]/jobs/actions";

interface CreateJobModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
}

type JobTemplate = "fedex_pd" | "scratch";

export function CreateJobModal({
  open,
  onClose,
  companyId,
}: CreateJobModalProps) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [template, setTemplate] = useState<JobTemplate>("fedex_pd");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setLocation("");
      setTemplate("fedex_pd");
      setError("");
    }
  }, [open]);

  const isFormValid = title.trim().length > 0 && location.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isPending) return;

    setError("");

    const formData = new FormData();
    formData.append("companyId", companyId);
    formData.append("title", title.trim());
    formData.append("location", location.trim());
    formData.append("template", template);

    startTransition(async () => {
      try {
        const result = await addJob(formData);
        if (result.success && result.redirectUrl) {
          // Close modal first for smooth UX
          onClose();
          // Navigate to the new job
          router.push(result.redirectUrl);
        }
      } catch (err: any) {
        setError(err.message || "Failed to create job. Please try again.");
      }
    });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Create new job</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-2">
          <div>
            <Input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Job title"
              required
              autoFocus
              disabled={isPending}
              className="h-12 text-base"
            />
          </div>

          <div>
            <Input
              name="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              required
              disabled={isPending}
              className="h-12 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-900 mb-3">
              Job Template
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors hover:bg-stone-50 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50">
                <input
                  type="radio"
                  name="template"
                  value="fedex_pd"
                  checked={template === "fedex_pd"}
                  onChange={(e) => setTemplate(e.target.value as JobTemplate)}
                  disabled={isPending}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-stone-900">FedEx P&D Template</div>
                  <div className="text-sm text-stone-600">Includes New Applicants, Background Check, Interview, and HR Paperwork groups</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors hover:bg-stone-50 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50">
                <input
                  type="radio"
                  name="template"
                  value="scratch"
                  checked={template === "scratch"}
                  onChange={(e) => setTemplate(e.target.value as JobTemplate)}
                  disabled={isPending}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-stone-900">Start from Scratch</div>
                  <div className="text-sm text-stone-600">Begin with a single empty group</div>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="tertiary"
              onClick={onClose}
              disabled={isPending}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={!isFormValid || isPending}
              className="px-6"
            >
              {isPending ? "Creating..." : "Create job"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
