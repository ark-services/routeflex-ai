"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

interface DeleteConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  itemName: string;
  confirmText?: string;
  onDelete: () => Promise<{ success?: boolean; error?: string }>;
  onSuccess?: () => void;
}

export function DeleteConfirmationModal({
  open,
  onClose,
  title,
  description,
  itemName,
  confirmText,
  onDelete,
  onSuccess
}: DeleteConfirmationModalProps) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const requiresConfirmation = confirmText && confirmText.length > 0;

  const handleDelete = () => {
    if (requiresConfirmation && confirmation !== confirmText) {
      setError(`Please type "${confirmText}" to confirm`);
      return;
    }

    startTransition(async () => {
      const result = await onDelete();
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
    setConfirmation("");
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
          <div className="bg-rf-danger-bg border border-red-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-rf-danger flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-900 mb-1">
                  Warning: This action cannot be undone
                </h3>
                <p className="text-sm text-red-700">{description}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm text-rf-ink-700 mb-2">
              Are you sure you want to delete <span className="font-semibold">{itemName}</span>?
            </p>
            {requiresConfirmation && (
              <>
                <p className="text-sm text-rf-ink-500 mb-3">
                  Type <span className="font-mono font-semibold">{confirmText}</span> to confirm:
                </p>
                <input
                  type="text"
                  value={confirmation}
                  onChange={(e) => {
                    setConfirmation(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isPending && confirmation === confirmText) {
                      handleDelete();
                    }
                  }}
                  className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  disabled={isPending}
                  autoFocus
                />
              </>
            )}
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
              onClick={handleDelete}
              disabled={isPending || (requiresConfirmation ? confirmation !== confirmText : false)}
              className="px-4 py-2 text-sm font-medium text-white bg-rf-danger rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
