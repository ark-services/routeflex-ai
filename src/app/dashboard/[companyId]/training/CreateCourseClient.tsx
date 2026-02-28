"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, BookOpen, ChevronDown } from "lucide-react";
import { createCourse, cloneCourseFromTemplate } from "./actions";

const CARRIER_LABELS: Record<string, string> = {
  fedex_pd: "FedEx P&D",
  fedex_linehaul: "FedEx Linehaul",
  amazon_dsp: "Amazon DSP",
  custom: "Custom",
};

interface Props {
  companyId: string;
  templates: Array<{ id: string; name: string; carrier_type: string | null }>;
}

export function CreateCourseClient({ companyId, templates }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"template" | "blank" | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [blankName, setBlankName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setMode(null);
    setSelectedTemplate("");
    setBlankName("");
    setError(null);
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      let courseId: string;
      if (mode === "template" && selectedTemplate) {
        courseId = await cloneCourseFromTemplate(companyId, selectedTemplate);
      } else if (mode === "blank" && blankName.trim()) {
        courseId = await createCourse(companyId, { name: blankName });
      } else {
        return;
      }
      reset();
      router.push(`/dashboard/${companyId}/training/${courseId}`);
    } catch (err: any) {
      setError(err.message ?? "Failed to create course");
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-rf-ink-900 text-white text-sm font-medium rounded-lg hover:bg-rf-ink-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Course
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-rf-surface-card rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-rf-text-primary mb-4">Create a Course</h2>

            {error && (
              <div className="mb-4 p-2 bg-rf-danger-bg border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Mode selection */}
            {mode === null && (
              <div className="space-y-2">
                {templates.length > 0 && (
                  <button
                    onClick={() => setMode("template")}
                    className="w-full flex items-center gap-3 p-4 border-2 border-rf-border rounded-xl hover:border-blue-400 hover:bg-rf-blue-tint transition-all text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-rf-blue-tint flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-5 h-5 text-rf-blue" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-rf-text-primary">Start from a template</p>
                      <p className="text-xs text-rf-text-secondary">
                        Clone a pre-built carrier curriculum and customize it
                      </p>
                    </div>
                  </button>
                )}
                <button
                  onClick={() => setMode("blank")}
                  className="w-full flex items-center gap-3 p-4 border-2 border-rf-border rounded-xl hover:border-rf-ink-300 hover:bg-rf-surface-page transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-rf-ink-100 flex items-center justify-center flex-shrink-0">
                    <Plus className="w-5 h-5 text-rf-text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-rf-text-primary">Start from scratch</p>
                    <p className="text-xs text-rf-text-secondary">Build your own custom course</p>
                  </div>
                </button>
                <button
                  onClick={reset}
                  className="w-full text-sm text-rf-text-secondary hover:text-rf-ink-700 transition-colors mt-2 py-2"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Template picker */}
            {mode === "template" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-rf-ink-700 mb-2">
                    Choose a template
                  </label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplate(t.id)}
                        className={`w-full flex items-center gap-3 p-3 border-2 rounded-lg text-left transition-all ${
                          selectedTemplate === t.id
                            ? "border-rf-blue bg-rf-blue-tint"
                            : "border-rf-border hover:border-rf-ink-100"
                        }`}
                      >
                        <BookOpen className="w-4 h-4 text-rf-blue flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-rf-text-primary">{t.name}</p>
                          {t.carrier_type && (
                            <p className="text-xs text-rf-text-secondary">
                              {CARRIER_LABELS[t.carrier_type] ?? t.carrier_type}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCreate}
                    disabled={!selectedTemplate || saving}
                    className="px-4 py-2 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Creating…" : "Create Course"}
                  </button>
                  <button
                    onClick={() => { setMode(null); setSelectedTemplate(""); }}
                    className="text-sm text-rf-text-secondary hover:text-rf-ink-700 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* Blank course */}
            {mode === "blank" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-rf-ink-700 mb-1.5">
                    Course Name *
                  </label>
                  <input
                    type="text"
                    value={blankName}
                    onChange={(e) => setBlankName(e.target.value)}
                    placeholder="e.g. Safety Training"
                    autoFocus
                    className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCreate}
                    disabled={!blankName.trim() || saving}
                    className="px-4 py-2 bg-rf-ink-900 text-white text-sm font-medium rounded-lg hover:bg-rf-ink-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Creating…" : "Create Course"}
                  </button>
                  <button
                    onClick={() => { setMode(null); setBlankName(""); }}
                    className="text-sm text-rf-text-secondary hover:text-rf-ink-700 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
