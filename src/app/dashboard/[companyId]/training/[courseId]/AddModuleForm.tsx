"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardCheck, BookOpen } from "lucide-react";
import { createModule } from "../actions";

interface Props {
  companyId: string;
  courseId: string;
  isFinalExam: boolean;
}

export function AddModuleForm({ companyId, courseId, isFinalExam }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const moduleId = await createModule(companyId, courseId, {
        title,
        content: "",
        is_final_exam: isFinalExam,
      });
      setTitle("");
      setOpen(false);
      router.push(`/dashboard/${companyId}/training/${courseId}/modules/${moduleId}`);
    } catch (err: any) {
      setError(err.message ?? "Failed to add");
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 rounded-lg text-sm text-stone-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        {isFinalExam ? (
          <><ClipboardCheck className="w-4 h-4" /> Add final exam</>
        ) : (
          <><Plus className="w-4 h-4" /> Add module</>
        )}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-stone-200 rounded-lg p-3 bg-white space-y-2">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>
      )}
      <div className="flex items-center gap-2">
        {isFinalExam ? (
          <ClipboardCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
        ) : (
          <BookOpen className="w-4 h-4 text-stone-400 flex-shrink-0" />
        )}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isFinalExam ? "Final exam title" : "Module title"}
          autoFocus
          required
          className="flex-1 px-2 py-1.5 border border-stone-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Adding…" : isFinalExam ? "Add Final Exam" : "Add Module"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTitle(""); setError(null); }}
          className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
