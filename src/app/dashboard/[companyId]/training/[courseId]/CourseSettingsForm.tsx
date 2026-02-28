"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCourse, deleteCourse } from "../actions";

interface Props {
  companyId: string;
  course: {
    id: string;
    name: string;
    description: string | null;
    is_published: boolean;
    passing_threshold: number;
  };
}

export function CourseSettingsForm({ companyId, course }: Props) {
  const router = useRouter();
  const [name, setName] = useState(course.name);
  const [description, setDescription] = useState(course.description ?? "");
  const [passingThreshold, setPassingThreshold] = useState(course.passing_threshold);
  const [isPublished, setIsPublished] = useState(course.is_published);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateCourse(companyId, course.id, {
        name,
        description,
        is_published: isPublished,
        passing_threshold: passingThreshold,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete course "${course.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteCourse(companyId, course.id);
      router.push(`/dashboard/${companyId}/training`);
    } catch (err: any) {
      setError(err.message ?? "Failed to delete");
      setDeleting(false);
    }
  }

  return (
    <div className="bg-rf-surface-card border border-rf-border rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-rf-ink-700">Course Settings</h2>

      {error && (
        <div className="p-2 bg-rf-danger-bg border border-red-200 rounded text-xs text-red-700">{error}</div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-rf-ink-500 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-rf-ink-500 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-rf-ink-500 mb-1">
            Passing Threshold (%)
          </label>
          <input
            type="number"
            min={50}
            max={100}
            value={passingThreshold}
            onChange={(e) => setPassingThreshold(Number(e.target.value))}
            className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue"
          />
          <p className="text-xs text-rf-text-muted mt-1">Applies to all module quizzes and final exam.</p>
        </div>

        <div className="flex items-center gap-3 pt-1 border-t border-rf-ink-100">
          <button
            type="button"
            role="switch"
            aria-checked={isPublished}
            onClick={() => setIsPublished((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              isPublished ? "bg-rf-success" : "bg-rf-ink-300"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-rf-surface-card shadow transition-transform ${
                isPublished ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-rf-ink-700">
            {isPublished ? "Published — learners can enroll" : "Draft — not visible to learners"}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-rf-blue text-white text-xs font-medium rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </form>

      <div className="pt-3 border-t border-rf-ink-100">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-rf-danger hover:text-rf-danger transition-colors disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete course"}
        </button>
      </div>
    </div>
  );
}
