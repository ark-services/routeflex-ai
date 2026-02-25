"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteModule } from "../actions";

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

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm("Delete this module and all its questions? This cannot be undone.")) return;
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
      className="p-1.5 text-stone-400 hover:text-red-600 transition-colors disabled:opacity-50 flex-shrink-0"
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
