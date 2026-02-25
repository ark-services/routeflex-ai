"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp, Eye, Pencil, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  updateTemplateModule,
  createTemplateQuestion,
  updateTemplateQuestion,
  deleteTemplateQuestion,
  createTemplateQuestionsBulk,
} from "../../../actions";
import { GenerateWithAI } from "@/components/lms/GenerateWithAI";

interface Question {
  id: string;
  question_text: string;
  options: Array<{ id: string; text: string }>;
  correct_option_id: string;
  sort_order: number;
}

interface Props {
  templateId: string;
  module: {
    id: string;
    title: string;
    content: string;
    is_final_exam: boolean;
  };
  questions: Question[];
}

const OPTION_IDS = ["a", "b", "c", "d"];

export function ModuleEditor({ templateId, module: mod, questions: initialQuestions }: Props) {
  const [title, setTitle] = useState(mod.title);
  const [content, setContent] = useState(mod.content);
  const [contentTab, setContentTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateTemplateModule(mod.id, templateId, { title, content });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddQuestion() {
    const newQ = {
      question_text: "",
      options: OPTION_IDS.map((id) => ({ id, text: "" })),
      correct_option_id: "a",
    };
    try {
      const id = await createTemplateQuestion(mod.id, templateId, newQ);
      setQuestions((prev) => [
        ...prev,
        { id, sort_order: prev.length, ...newQ },
      ]);
    } catch (err: any) {
      alert(err.message ?? "Failed to add question");
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!confirm("Delete this question?")) return;
    try {
      await deleteTemplateQuestion(questionId, mod.id, templateId);
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    } catch (err: any) {
      alert(err.message ?? "Failed to delete");
    }
  }

  async function handleGenerateQuestions() {
    if (!content.trim()) {
      alert("Add module content first, then generate questions.");
      return;
    }
    if (questions.length > 0) {
      const confirmed = confirm(
        `Replace the existing ${questions.length} question${questions.length === 1 ? "" : "s"} with AI-generated ones?`
      );
      if (!confirmed) return;
    }
    setGeneratingQuestions(true);
    try {
      const res = await fetch("/api/lms/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");

      // Delete existing questions first if any
      for (const q of questions) {
        await deleteTemplateQuestion(q.id, mod.id, templateId);
      }

      const created = await createTemplateQuestionsBulk(templateId, mod.id, data.questions);
      setQuestions(created);
    } catch (err: any) {
      alert(err.message ?? "Something went wrong.");
    } finally {
      setGeneratingQuestions(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Module content */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-stone-700 mb-4">
          {mod.is_final_exam ? "Final Exam" : "Module Content"}
        </h2>

        <form onSubmit={handleSave} className="space-y-4">
          {saveError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{saveError}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {!mod.is_final_exam && (
            <div className="space-y-2">
              {/* Toolbar: label + Write/Preview toggle */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-stone-600">Content</label>
                {/* Write / Preview toggle */}
                <div className="flex items-center rounded-lg border border-stone-200 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setContentTab("write")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      contentTab === "write"
                        ? "bg-stone-900 text-white"
                        : "text-stone-500 hover:text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    <Pencil className="w-3 h-3" />
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentTab("preview")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      contentTab === "preview"
                        ? "bg-stone-900 text-white"
                        : "text-stone-500 hover:text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    Preview
                  </button>
                </div>
              </div>

              {/* AI generator — full-width row, panel expands below without disrupting toolbar */}
              <GenerateWithAI
                moduleTitle={title}
                onGenerated={(generated) => {
                  setContent(generated);
                  setContentTab("preview");
                }}
              />

              {contentTab === "write" ? (
                <div>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={16}
                    placeholder="Write the module content in Markdown, or use Generate with AI to create it from slides."
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <p className="text-xs text-stone-400 mt-1">
                    Markdown supported — **bold**, ## headings, - lists, etc.
                  </p>
                </div>
              ) : (
                <div className="min-h-[200px] px-4 py-3 border border-stone-200 rounded-lg bg-stone-50">
                  {content.trim() ? (
                    <div className="prose prose-stone prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-stone-400 italic">
                      Nothing to preview yet. Switch to Write to add content.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save Content"}
            </button>
          </div>
        </form>
      </div>

      {/* Questions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-700">
              Quiz Questions
              <span className="ml-2 text-xs font-normal text-stone-400">
                ({questions.length} / 12 recommended)
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateQuestions}
              disabled={generatingQuestions}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
            >
              {generatingQuestions ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Questions
                </>
              )}
            </button>
            <button
              onClick={handleAddQuestion}
              disabled={questions.length >= 15}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Question
            </button>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-8 text-stone-400 border border-dashed border-stone-200 rounded-lg">
            <p className="text-sm">No questions yet. Add 10–12 questions.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <QuestionEditor
                key={q.id}
                question={q}
                index={idx}
                templateId={templateId}
                moduleId={mod.id}
                onDelete={() => handleDeleteQuestion(q.id)}
                onChange={(updated) =>
                  setQuestions((prev) =>
                    prev.map((x) => (x.id === updated.id ? updated : x))
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Individual question editor ─────────────────────────────────────────────────

function QuestionEditor({
  question,
  index,
  templateId,
  moduleId,
  onDelete,
  onChange,
}: {
  question: Question;
  index: number;
  templateId: string;
  moduleId: string;
  onDelete: () => void;
  onChange: (q: Question) => void;
}) {
  const [localQ, setLocalQ] = useState(question);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  function updateOption(optionId: string, text: string) {
    setLocalQ((prev) => ({
      ...prev,
      options: prev.options.map((o) => (o.id === optionId ? { ...o, text } : o)),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateTemplateQuestion(localQ.id, moduleId, templateId, {
        question_text: localQ.question_text,
        options: localQ.options,
        correct_option_id: localQ.correct_option_id,
      });
      onChange(localQ);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      alert(err.message ?? "Failed to save question");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
        <span className="text-xs font-semibold text-stone-500 w-6">Q{index + 1}</span>
        <span className="flex-1 text-sm text-stone-700 truncate">
          {localQ.question_text || <em className="text-stone-400 not-italic">Untitled question</em>}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-1 text-stone-400 hover:text-stone-700 transition-colors"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1 text-stone-400 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Question text */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Question</label>
            <textarea
              value={localQ.question_text}
              onChange={(e) => setLocalQ((prev) => ({ ...prev, question_text: e.target.value }))}
              rows={2}
              placeholder="Enter the question..."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Answer options */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-2">
              Answer Options <span className="text-stone-400">(select the correct answer)</span>
            </label>
            <div className="space-y-2">
              {localQ.options.map((option) => (
                <div key={option.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${localQ.id}`}
                    checked={localQ.correct_option_id === option.id}
                    onChange={() =>
                      setLocalQ((prev) => ({ ...prev, correct_option_id: option.id }))
                    }
                    className="w-4 h-4 text-green-600 flex-shrink-0"
                  />
                  <span className="text-xs font-semibold text-stone-500 w-4 uppercase">{option.id}</span>
                  <input
                    type="text"
                    value={option.text}
                    onChange={(e) => updateOption(option.id, e.target.value)}
                    placeholder={`Option ${option.id.toUpperCase()}`}
                    className="flex-1 px-3 py-1.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {localQ.correct_option_id === option.id && (
                    <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ correct</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save Question"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
