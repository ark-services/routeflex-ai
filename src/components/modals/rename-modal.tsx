"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

interface RenameModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  currentName: string;
  onRename: (newName: string) => Promise<{ success?: boolean; error?: string }>;
  onSuccess?: () => void;
}

export function RenameModal({
  open,
  onClose,
  title,
  currentName,
  onRename,
  onSuccess
}: RenameModalProps) {
  const [newName, setNewName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleRename = () => {
    if (!newName.trim()) {
      setError("Name cannot be empty");
      return;
    }

    startTransition(async () => {
      const result = await onRename(newName.trim());
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
        onSuccess?.();
        onClose();
      }
    });
  };

  const handleClose = () => {
    setNewName(currentName);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-rf-ink-700 mb-2">
              New name
            </label>
            <input
              id="name"
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isPending) {
                  handleRename();
                }
              }}
              className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-rf-blue focus:border-transparent"
              disabled={isPending}
              autoFocus
            />
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
              onClick={handleRename}
              disabled={isPending || !newName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-rf-blue rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Renaming..." : "Rename"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
