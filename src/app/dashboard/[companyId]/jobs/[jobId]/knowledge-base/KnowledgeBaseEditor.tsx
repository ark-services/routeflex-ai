"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Sparkles, Trash2, ChevronUp, ChevronDown, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createKnowledgeBaseEntry,
  updateKnowledgeBaseEntry,
  deleteKnowledgeBaseEntry,
  reorderKnowledgeBaseEntries,
} from "./actions";

interface KBEntry {
  id: string;
  job_id: string;
  company_id: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface KnowledgeBaseEditorProps {
  companyId: string;
  jobId: string;
  jobTitle: string;
  initialEntries: KBEntry[];
}

export default function KnowledgeBaseEditor({
  companyId,
  jobId,
  jobTitle,
  initialEntries,
}: KnowledgeBaseEditorProps) {
  const [entries, setEntries] = useState<KBEntry[]>(initialEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const newQuestionRef = useRef<HTMLTextAreaElement>(null);
  const editQuestionRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus new question input
  useEffect(() => {
    if (adding && newQuestionRef.current) {
      newQuestionRef.current.focus();
    }
  }, [adding]);

  // Auto-focus edit question input
  useEffect(() => {
    if (editingId && editQuestionRef.current) {
      editQuestionRef.current.focus();
    }
  }, [editingId]);

  const handleAdd = useCallback(async () => {
    if (!newQuestion.trim() && !newAnswer.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createKnowledgeBaseEntry(companyId, jobId, {
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
      });
      setEntries((prev) => [...prev, created]);
      setNewQuestion("");
      setNewAnswer("");
      setAdding(false);
    } catch (err: any) {
      setError(err.message || "Failed to add entry");
    } finally {
      setSaving(false);
    }
  }, [companyId, jobId, newQuestion, newAnswer]);

  const handleStartEdit = useCallback((entry: KBEntry) => {
    setEditingId(entry.id);
    setEditQuestion(entry.question);
    setEditAnswer(entry.answer);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditQuestion("");
    setEditAnswer("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateKnowledgeBaseEntry(companyId, jobId, editingId, {
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === editingId ? updated : e))
      );
      setEditingId(null);
      setEditQuestion("");
      setEditAnswer("");
    } catch (err: any) {
      setError(err.message || "Failed to update entry");
    } finally {
      setSaving(false);
    }
  }, [companyId, jobId, editingId, editQuestion, editAnswer]);

  const handleDelete = useCallback(
    async (entryId: string) => {
      setSaving(true);
      setError(null);
      try {
        await deleteKnowledgeBaseEntry(companyId, jobId, entryId);
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setDeleteConfirmId(null);
      } catch (err: any) {
        setError(err.message || "Failed to delete entry");
      } finally {
        setSaving(false);
      }
    },
    [companyId, jobId]
  );

  const handleMoveUp = useCallback(
    async (index: number) => {
      if (index === 0) return;
      const newEntries = [...entries];
      [newEntries[index - 1], newEntries[index]] = [
        newEntries[index],
        newEntries[index - 1],
      ];
      setEntries(newEntries);
      try {
        await reorderKnowledgeBaseEntries(
          companyId,
          jobId,
          newEntries.map((e) => e.id)
        );
      } catch (err: any) {
        // Revert on error
        setEntries(entries);
        setError(err.message || "Failed to reorder");
      }
    },
    [companyId, jobId, entries]
  );

  const handleMoveDown = useCallback(
    async (index: number) => {
      if (index === entries.length - 1) return;
      const newEntries = [...entries];
      [newEntries[index], newEntries[index + 1]] = [
        newEntries[index + 1],
        newEntries[index],
      ];
      setEntries(newEntries);
      try {
        await reorderKnowledgeBaseEntries(
          companyId,
          jobId,
          newEntries.map((e) => e.id)
        );
      } catch (err: any) {
        setEntries(entries);
        setError(err.message || "Failed to reorder");
      }
    },
    [companyId, jobId, entries]
  );

  const handlePolish = useCallback(async () => {
    if (entries.length === 0) return;
    setPolishing(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-base/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: entries.map((e) => ({
            id: e.id,
            question: e.question,
            answer: e.answer,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Polish failed (${res.status})`);
      }

      const { entries: polished } = await res.json();

      // Persist each polished entry
      const updated: KBEntry[] = [];
      for (const p of polished) {
        const existing = entries.find((e) => e.id === p.id);
        if (!existing) continue;

        // Only update if something changed
        if (p.question !== existing.question || p.answer !== existing.answer) {
          const result = await updateKnowledgeBaseEntry(companyId, jobId, p.id, {
            question: p.question,
            answer: p.answer,
          });
          updated.push(result);
        } else {
          updated.push(existing);
        }
      }

      // Preserve any entries not returned by polish (shouldn't happen, but safe)
      const polishedIds = new Set(polished.map((p: any) => p.id));
      const remaining = entries.filter((e) => !polishedIds.has(e.id));
      setEntries([...updated, ...remaining]);
    } catch (err: any) {
      setError(err.message || "Failed to polish entries");
    } finally {
      setPolishing(false);
    }
  }, [companyId, jobId, entries]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-rf-ink-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-rf-text-muted" />
            Knowledge Base
          </h1>
          <p className="text-sm text-rf-text-muted mt-1">
            Add FAQs that AI can use when communicating with applicants for{" "}
            <span className="font-medium text-rf-ink-700">{jobTitle}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <Button
              variant="secondary"
              onClick={handlePolish}
              disabled={polishing || saving}
              className="gap-1.5"
            >
              {polishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Polishing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Polish with AI
                </>
              )}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setAdding(true);
              setError(null);
            }}
            disabled={adding}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add Q&A
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Entry list */}
      <div className="space-y-3">
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className="bg-rf-surface-card border border-rf-border rounded-lg shadow-sm"
          >
            {editingId === entry.id ? (
              /* ── Editing mode ── */
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1">
                    Question
                  </label>
                  <textarea
                    ref={editQuestionRef}
                    value={editQuestion}
                    onChange={(e) => setEditQuestion(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-rf-ink-100 rounded-md bg-rf-surface-card text-rf-ink-900 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 resize-y"
                    placeholder="e.g. What are the working hours?"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1">
                    Answer
                  </label>
                  <textarea
                    value={editAnswer}
                    onChange={(e) => setEditAnswer(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-rf-ink-100 rounded-md bg-rf-surface-card text-rf-ink-900 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 resize-y"
                    placeholder="Provide a clear, concise answer…"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="tertiary"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs"
                  >
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Display mode ── */
              <div
                className="p-4 cursor-pointer hover:bg-rf-surface-page/50 transition-colors"
                onClick={() => handleStartEdit(entry)}
              >
                <div className="flex items-start gap-3">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveUp(index);
                      }}
                      disabled={index === 0}
                      className="p-0.5 text-rf-ink-300 hover:text-rf-ink-700 disabled:opacity-30 disabled:cursor-default transition-colors"
                      title="Move up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveDown(index);
                      }}
                      disabled={index === entries.length - 1}
                      className="p-0.5 text-rf-ink-300 hover:text-rf-ink-700 disabled:opacity-30 disabled:cursor-default transition-colors"
                      title="Move down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-rf-ink-900">
                      {entry.question || (
                        <span className="text-rf-text-muted italic">No question</span>
                      )}
                    </p>
                    <p className="text-sm text-rf-ink-500 mt-1 whitespace-pre-wrap">
                      {entry.answer || (
                        <span className="text-rf-text-muted italic">No answer</span>
                      )}
                    </p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(entry.id);
                    }}
                    className="p-1.5 text-rf-ink-300 hover:text-rf-danger rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Delete confirmation */}
            {deleteConfirmId === entry.id && (
              <div className="px-4 pb-3 flex items-center gap-2 border-t border-rf-border pt-3">
                <span className="text-sm text-rf-ink-500">Delete this Q&A?</span>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(entry.id)}
                  disabled={saving}
                  className="px-3 py-1 text-xs"
                >
                  {saving ? "Deleting…" : "Delete"}
                </Button>
                <Button
                  variant="tertiary"
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={saving}
                  className="px-3 py-1 text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Add new entry form */}
        {adding && (
          <div className="bg-rf-surface-card border-2 border-rf-blue/30 rounded-lg shadow-sm p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1">
                Question
              </label>
              <textarea
                ref={newQuestionRef}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-rf-ink-100 rounded-md bg-rf-surface-card text-rf-ink-900 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 resize-y"
                placeholder="e.g. What are the working hours?"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1">
                Answer
              </label>
              <textarea
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-rf-ink-100 rounded-md bg-rf-surface-card text-rf-ink-900 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 resize-y"
                placeholder="Provide a clear, concise answer…"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="tertiary"
                onClick={() => {
                  setAdding(false);
                  setNewQuestion("");
                  setNewAnswer("");
                }}
                disabled={saving}
                className="px-3 py-1.5 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={handleAdd}
                disabled={saving || (!newQuestion.trim() && !newAnswer.trim())}
                className="px-3 py-1.5 text-xs"
              >
                {saving ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {entries.length === 0 && !adding && (
          <div className="text-center py-16">
            <BookOpen className="h-10 w-10 text-rf-ink-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-rf-ink-700">
              No FAQs yet
            </h3>
            <p className="text-sm text-rf-text-muted mt-1 max-w-sm mx-auto">
              Add questions and answers that AI can use when communicating with
              applicants via email, text, or phone.
            </p>
            <Button
              variant="secondary"
              onClick={() => setAdding(true)}
              className="mt-4 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add your first Q&A
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
