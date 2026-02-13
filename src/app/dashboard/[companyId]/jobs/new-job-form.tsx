"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JOB_STATUSES } from "@/lib/types";

export function NewJobForm({
  companyId,
  action,
}: {
  companyId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New Job</Button>;
  }

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-sm font-semibold text-stone-900">New job</h2>
      <form
        action={async (formData) => {
          await action(formData);
          setOpen(false);
        }}
      >
        <input type="hidden" name="companyId" value={companyId} />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Input name="title" placeholder="Job title" required />
          <Input name="location" placeholder="Location" />
          <Input name="terminal" placeholder="Terminal" />
          <select
            name="status"
            defaultValue="open"
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 transition-colors focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-1"
          >
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Create job</Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
