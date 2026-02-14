"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createJob } from "./actions";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    console.log("[CreateJobModal] Starting job creation...");

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("location", location);
      formData.append("terminal", terminal);
      formData.append("companyId", companyId);

      const result = await createJob(formData);

      if (result.error) {
        console.error("[CreateJobModal] Error:", result.error);
        setError(result.error);
      } else if (result.jobId) {
        console.log("[CreateJobModal] Job created successfully:", result.jobId);
        console.log("[CreateJobModal] Navigating to /dashboard/" + companyId + "/jobs/" + result.jobId + "/applicants");

        setTitle("");
        setLocation("");
        setTerminal("");
        onClose();

        // Navigate to the new job's applicants page
        router.push(`/dashboard/${companyId}/jobs/${result.jobId}/applicants`);

        // Refresh to ensure server components re-fetch with the new job
        router.refresh();

        console.log("[CreateJobModal] Navigation and refresh complete");
      }
    } catch (err) {
      console.error("[CreateJobModal] Exception:", err);
      setError("Failed to create job");
    } finally {
      setLoading(false);
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
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create job"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
