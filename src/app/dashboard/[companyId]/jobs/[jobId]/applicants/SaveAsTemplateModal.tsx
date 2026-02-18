"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Loader2, CheckCircle2, XCircle, BookTemplate, PlusCircle } from "lucide-react";
import { captureJobLayoutToTemplate } from "@/app/super-admin/templates/actions";

interface Template {
  id: string;
  title: string;
  is_published: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  jobId: string;
}

export function SaveAsTemplateModal({ open, onClose, companyId, jobId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // "existing" | "new"
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [includeSeedRows, setIncludeSeedRows] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [done, setDone] = useState(false);

  // Fetch templates when modal opens
  useEffect(() => {
    if (!open) return;
    setLoadingTemplates(true);
    setDone(false);
    setToast(null);
    fetch("/api/super-admin/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, [open]);

  if (!open) return null;

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
  };

  const handleCapture = () => {
    if (mode === "existing" && !selectedTemplateId) {
      showToast("Please select a template.", "error");
      return;
    }
    if (mode === "new" && !newTitle.trim()) {
      showToast("Please enter a title for the new template.", "error");
      return;
    }

    const target =
      mode === "existing"
        ? { templateId: selectedTemplateId }
        : { title: newTitle.trim(), description: newDescription.trim() };

    startTransition(async () => {
      try {
        const result = await captureJobLayoutToTemplate(
          companyId,
          jobId,
          target,
          includeSeedRows
        );

        if (result.error) {
          showToast(result.error, "error");
        } else {
          setDone(true);
          showToast(
            mode === "new"
              ? `Template "${newTitle}" created with this job's layout.`
              : "Template layout updated successfully.",
            "success"
          );
        }
      } catch (err) {
        showToast((err as Error).message, "error");
      }
    });
  };

  const handleClose = () => {
    // Reset state
    setMode("existing");
    setSelectedTemplateId("");
    setNewTitle("");
    setNewDescription("");
    setIncludeSeedRows(false);
    setToast(null);
    setDone(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-base font-semibold text-stone-900">
            Save as Template
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors text-stone-400 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
          {/* Toast */}
          {toast && (
            <div
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm ${
                toast.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              {toast.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              )}
              {toast.message}
            </div>
          )}

          {!done && (
            <>
              {/* Mode toggle */}
              <div className="flex rounded-lg border border-stone-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                    mode === "existing"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  <BookTemplate className="h-3.5 w-3.5" />
                  Existing template
                </button>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors border-l border-stone-200 ${
                    mode === "new"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Create new
                </button>
              </div>

              {/* Existing template selector */}
              {mode === "existing" && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Select template
                  </label>
                  {loadingTemplates ? (
                    <div className="flex items-center gap-2 text-sm text-stone-500 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading templates…
                    </div>
                  ) : templates.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      No templates yet.{" "}
                      <button
                        type="button"
                        onClick={() => setMode("new")}
                        className="text-blue-600 hover:underline"
                      >
                        Create one.
                      </button>
                    </p>
                  ) : (
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Choose a template…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                          {!t.is_published ? " (draft)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="mt-1.5 text-xs text-stone-400">
                    This will overwrite the selected template's layout with the current job's groups, columns, and automations.
                  </p>
                </div>
              )}

              {/* New template fields */}
              {mode === "new" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Template title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g. FedEx Package Handler"
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      rows={2}
                      placeholder="Brief description for the Template Center"
                      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Include seed rows */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    checked={includeSeedRows}
                    onChange={(e) => setIncludeSeedRows(e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <span className="text-sm font-medium text-stone-700 group-hover:text-stone-900">
                    Include seed rows
                  </span>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Captures up to 25 applicant rows per group with their cell values. Use this to give users pre-filled example data.
                  </p>
                </div>
              </label>

              {/* What gets captured callout */}
              <div className="px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-500 space-y-1">
                <p className="font-medium text-stone-600">What gets captured:</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Board groups (name, color, order)</li>
                  <li>Board columns (name, type, order)</li>
                  <li>Job automations (start disabled in target job)</li>
                  {includeSeedRows && <li>Up to 25 rows per group with cell values</li>}
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-stone-100 bg-stone-50/50">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={handleCapture}
              disabled={
                isPending ||
                (mode === "existing" && !selectedTemplateId) ||
                (mode === "new" && !newTitle.trim())
              }
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isPending ? "Capturing…" : "Capture Layout"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
