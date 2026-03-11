"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteModule } from "../actions";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteModuleButton({
  companyId,
  courseId,
  moduleId,
}: {
  companyId: string;
  courseId: string;
  moduleId: string;
}) {
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirmDialog();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!await confirm({ title: "Delete Module", description: "This will delete the module and all its questions. This cannot be undone.", confirmLabel: "Delete", variant: "destructive" })) return;
    setDeleting(true);
    try {
      await deleteModule(companyId, courseId, moduleId);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="p-1.5 text-rf-text-muted hover:text-rf-danger transition-colors disabled:opacity-50 flex-shrink-0"
      title="Delete module"
    >
      {deleting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Trash2 className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
