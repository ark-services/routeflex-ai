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
      <div className="relative z-10 w-full max-w-md bg-rf-surface-card rounded-xl shadow-xl border border-rf-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rf-ink-100">
          <h2 className="text-base font-semibold text-rf-text-primary">
            Save as Template
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-rf-surface-page transition-colors text-rf-text-muted hover:text-rf-ink-500"
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
                  ? "bg-rf-success-bg border border-green-200 text-rf-success"
                  : "bg-rf-danger-bg border border-red-200 text-rf-danger"
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
              <div className="flex rounded-lg border border-rf-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                    mode === "existing"
                      ? "bg-rf-blue text-white"
                      : "bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page"
                  }`}
                >
                  <BookTemplate className="h-3.5 w-3.5" />
                  Existing template
                </button>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors border-l border-rf-border ${
                    mode === "new"
                      ? "bg-rf-blue text-white"
                      : "bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page"
                  }`}
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Create new
                </button>
              </div>

              {/* Existing template selector */}
              {mode === "existing" && (
                <div>
                  <label className="block text-sm font-medium text-rf-ink-700 mb-1.5">
                    Select template
                  </label>
                  {loadingTemplates ? (
                    <div className="flex items-center gap-2 text-sm text-rf-text-secondary py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading templates…
                    </div>
                  ) : templates.length === 0 ? (
                    <p className="text-sm text-rf-text-secondary">
                      No templates yet.{" "}
                      <button
                        type="button"
                        onClick={() => setMode("new")}
                        className="text-rf-blue hover:underline"
                      >
                        Create one.
                      </button>
                    </p>
                  ) : (
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full rounded-lg border border-rf-border px-3 py-2 text-sm text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue bg-rf-surface-card"
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
                  <p className="mt-1.5 text-xs text-rf-text-muted">
                    This will overwrite the selected template's layout with the current job's groups, columns, and automations.
                  </p>
                </div>
              )}

              {/* New template fields */}
              {mode === "new" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-rf-ink-700 mb-1">
                      Template title <span className="text-rf-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g. FedEx Package Handler"
                      className="w-full rounded-lg border border-rf-border px-3 py-2 text-sm text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-rf-ink-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      rows={2}
                      placeholder="Brief description for the Template Center"
                      className="w-full rounded-lg border border-rf-border px-3 py-2 text-sm text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue resize-none"
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
                    className="h-4 w-4 rounded border-rf-ink-100 text-rf-blue focus:ring-rf-blue"
                  />
                </div>
                <div>
                  <span className="text-sm font-medium text-rf-ink-700 group-hover:text-rf-text-primary">
                    Include seed rows
                  </span>
                  <p className="text-xs text-rf-text-muted mt-0.5">
                    Captures up to 25 applicant rows per group with their cell values. Use this to give users pre-filled example data.
                  </p>
                </div>
              </label>

              {/* What gets captured callout */}
              <div className="px-3 py-2.5 bg-rf-surface-page border border-rf-border rounded-lg text-xs text-rf-text-secondary space-y-1">
                <p className="font-medium text-rf-ink-500">What gets captured:</p>
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
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-rf-ink-100 bg-rf-surface-page">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-rf-ink-500 hover:text-rf-text-primary transition-colors"
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
              className="flex items-center gap-2 px-4 py-2 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
