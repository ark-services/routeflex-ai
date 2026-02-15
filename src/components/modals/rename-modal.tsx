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
            <label htmlFor="name" className="block text-sm font-medium text-stone-700 mb-2">
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
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isPending}
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={handleClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              disabled={isPending || !newName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Renaming..." : "Rename"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
