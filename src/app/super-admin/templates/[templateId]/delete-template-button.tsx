"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteTemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDelete = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await fetch("/api/super-admin/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? "Failed to delete template");
      } else {
        router.push("/super-admin/templates");
      }
    });
  };

  if (confirmOpen) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-600">Delete this template?</span>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            onClick={() => { setConfirmOpen(false); setErrorMsg(null); }}
            className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-stone-400">
          Existing jobs that used this template will not be affected.
        </p>
        {errorMsg && (
          <p className="text-xs text-red-600">{errorMsg}</p>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirmOpen(true)}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
    >
      <Trash2 className="h-4 w-4" />
      Delete
    </button>
  );
}
