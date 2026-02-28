"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteTemplateModule } from "../actions";

export function DeleteModuleButton({
  moduleId,
  templateId,
}: {
  moduleId: string;
  templateId: string;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm("Delete this module and all its questions? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteTemplateModule(moduleId, templateId);
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
