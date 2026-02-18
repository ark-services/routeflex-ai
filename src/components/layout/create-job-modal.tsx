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

export function CreateJobModal({
  open,
  onClose,
  companyId,
}: CreateJobModalProps) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setLocation("");
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
    formData.append("template", "scratch");

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
