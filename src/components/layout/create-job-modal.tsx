"use client";

import { useState, useTransition } from "react";
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
  const [terminal, setTerminal] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    console.log("[CreateJobModal] Starting job creation...");

    const formData = new FormData(e.currentTarget as HTMLFormElement);
    formData.append("companyId", companyId);

    try {
      // Call addJob which handles everything and redirects
      startTransition(() => {
        addJob(formData);
        // Clean up modal state
        setTitle("");
        setLocation("");
        setTerminal("");
        onClose();
      });
    } catch (err: any) {
      console.error("[CreateJobModal] Exception:", err);
      setError(err.message || "Failed to create job");
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new job</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="job-title" className="block text-sm font-medium text-stone-700 mb-2">
              Job title
            </label>
            <Input
              id="job-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Senior Driver"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-stone-700 mb-2">
              Location
            </label>
            <Input
              id="location"
              name="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="San Francisco, CA"
            />
          </div>

          <div>
            <label htmlFor="terminal" className="block text-sm font-medium text-stone-700 mb-2">
              Terminal
            </label>
            <Input
              id="terminal"
              name="terminal"
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
              placeholder="SFO1"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create job"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
