"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  Sparkles,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  BookOpen,
  MessageCircleQuestion,
  GripVertical,
  Search,
  X,
} from "lucide-react";
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
  const [searchQuery, setSearchQuery] = useState("");
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

  const filteredEntries = searchQuery.trim()
    ? entries.filter(
        (e) =>
          e.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.answer.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

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
      const updated = await updateKnowledgeBaseEntry(
        companyId,
        jobId,
        editingId,
        {
          question: editQuestion.trim(),
          answer: editAnswer.trim(),
        }
      );
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

        if (p.question !== existing.question || p.answer !== existing.answer) {
          const result = await updateKnowledgeBaseEntry(
            companyId,
            jobId,
            p.id,
            {
              question: p.question,
              answer: p.answer,
            }
          );
          updated.push(result);
        } else {
          updated.push(existing);
        }
      }

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
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-rf-lg bg-rf-blue-tint flex-shrink-0">
            <BookOpen className="h-[18px] w-[18px] text-rf-blue" />
          </div>
          <h1 className="text-lg font-bold text-rf-ink-900 leading-tight">
            Knowledge Base
          </h1>
        </div>
        <p className="text-[13px] text-rf-text-muted leading-snug pl-12">
          FAQs that AI uses when communicating with applicants for{" "}
          <span className="font-semibold text-rf-ink-700">{jobTitle}</span>
        </p>
        <div className="flex items-center gap-2 mt-4 pl-12">
          <Button
            variant="primary"
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
        </div>

        {/* Search + count bar */}
        {entries.length > 2 && (
          <div className="mt-5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-rf-ink-300" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search questions & answers…"
                className="w-full pl-9 pr-8 py-2 text-sm border border-rf-ink-100 rounded-rf-md bg-rf-surface-card text-rf-ink-900 placeholder:text-rf-ink-300 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 transition-shadow"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-rf-ink-300 hover:text-rf-ink-700 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <span className="text-xs font-medium text-rf-ink-300 whitespace-nowrap tabular-nums">
              {searchQuery
                ? `${filteredEntries.length} of ${entries.length}`
                : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
            </span>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-rf-md text-sm text-red-700">
          <div className="mt-0.5 h-4 w-4 rounded-full bg-red-100 flex-shrink-0 flex items-center justify-center">
            <span className="text-[10px] font-bold text-red-600">!</span>
          </div>
          <div className="flex-1">{error}</div>
          <button
            onClick={() => setError(null)}
            className="p-0.5 text-red-400 hover:text-red-600 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Add new entry form */}
      {adding && (
        <div className="mb-5 bg-rf-surface-card border-2 border-rf-blue/25 rounded-rf-lg shadow-rf-md overflow-hidden animate-[fadeSlideIn_200ms_ease-out]">
          <div className="px-5 py-3.5 bg-rf-blue-tint/50 border-b border-rf-blue/10">
            <h3 className="text-sm font-semibold text-rf-blue flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Q&A Entry
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1.5">
                <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-rf-blue text-[10px] font-bold text-white leading-none">
                  Q
                </span>
                Question
              </label>
              <textarea
                ref={newQuestionRef}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 text-sm border border-rf-ink-100 rounded-rf-md bg-rf-surface-input text-rf-ink-900 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 focus:bg-rf-surface-card resize-y transition-all placeholder:text-rf-ink-300"
                placeholder="e.g. What are the working hours?"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1.5">
                <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-emerald-500 text-[10px] font-bold text-white leading-none">
                  A
                </span>
                Answer
              </label>
              <textarea
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                rows={4}
                className="w-full px-3.5 py-2.5 text-sm border border-rf-ink-100 rounded-rf-md bg-rf-surface-input text-rf-ink-900 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 focus:bg-rf-surface-card resize-y transition-all placeholder:text-rf-ink-300"
                placeholder="Provide a clear, concise answer…"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="tertiary"
                onClick={() => {
                  setAdding(false);
                  setNewQuestion("");
                  setNewAnswer("");
                }}
                disabled={saving}
                className="px-4 py-1.5 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleAdd}
                disabled={saving || (!newQuestion.trim() && !newAnswer.trim())}
                className="px-4 py-1.5 text-xs"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Adding…
                  </>
                ) : (
                  "Add Entry"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Entry list */}
      <div className="space-y-3">
        {filteredEntries.map((entry, index) => {
          const globalIndex = entries.indexOf(entry);
          return (
            <div
              key={entry.id}
              className={`group bg-rf-surface-card border rounded-rf-lg transition-all ${
                editingId === entry.id
                  ? "border-rf-blue/30 shadow-rf-md ring-1 ring-rf-blue/10"
                  : deleteConfirmId === entry.id
                    ? "border-rf-danger/30 shadow-rf-sm"
                    : "border-rf-border shadow-rf-sm hover:shadow-rf-md hover:border-rf-ink-100"
              }`}
            >
              {editingId === entry.id ? (
                /* ── Editing mode ── */
                <div className="overflow-hidden">
                  <div className="px-5 py-3 bg-rf-blue-tint/40 border-b border-rf-blue/10">
                    <span className="text-xs font-semibold text-rf-blue">
                      Editing Entry #{globalIndex + 1}
                    </span>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1.5">
                        <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-rf-blue text-[10px] font-bold text-white leading-none">
                          Q
                        </span>
                        Question
                      </label>
                      <textarea
                        ref={editQuestionRef}
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        rows={2}
                        className="w-full px-3.5 py-2.5 text-sm border border-rf-ink-100 rounded-rf-md bg-rf-surface-input text-rf-ink-900 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 focus:bg-rf-surface-card resize-y transition-all placeholder:text-rf-ink-300"
                        placeholder="e.g. What are the working hours?"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1.5">
                        <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-emerald-500 text-[10px] font-bold text-white leading-none">
                          A
                        </span>
                        Answer
                      </label>
                      <textarea
                        value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)}
                        rows={4}
                        className="w-full px-3.5 py-2.5 text-sm border border-rf-ink-100 rounded-rf-md bg-rf-surface-input text-rf-ink-900 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 focus:bg-rf-surface-card resize-y transition-all placeholder:text-rf-ink-300"
                        placeholder="Provide a clear, concise answer…"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="tertiary"
                        onClick={handleCancelEdit}
                        disabled={saving}
                        className="px-4 py-1.5 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="px-4 py-1.5 text-xs"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            Saving…
                          </>
                        ) : (
                          "Save Changes"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Display mode ── */
                <>
                  <div
                    className="p-4 cursor-pointer transition-colors"
                    onClick={() => handleStartEdit(entry)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Left: number + reorder */}
                      <div className="flex flex-col items-center gap-0.5 pt-px select-none">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveUp(globalIndex);
                          }}
                          disabled={globalIndex === 0 || !!searchQuery}
                          className="p-0.5 text-rf-ink-300 hover:text-rf-ink-700 disabled:opacity-0 disabled:cursor-default transition-all opacity-0 group-hover:opacity-100"
                          title="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-[11px] font-bold text-rf-ink-300 tabular-nums w-5 text-center">
                          {globalIndex + 1}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveDown(globalIndex);
                          }}
                          disabled={
                            globalIndex === entries.length - 1 || !!searchQuery
                          }
                          className="p-0.5 text-rf-ink-300 hover:text-rf-ink-700 disabled:opacity-0 disabled:cursor-default transition-all opacity-0 group-hover:opacity-100"
                          title="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <span className="mt-[3px] flex-shrink-0 inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-rf-blue text-[10px] font-bold text-white leading-none">
                            Q
                          </span>
                          <p className="text-sm font-semibold text-rf-ink-900 leading-snug">
                            {entry.question || (
                              <span className="text-rf-text-muted italic font-normal">
                                No question
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-start gap-2 mt-2">
                          <span className="mt-[3px] flex-shrink-0 inline-flex items-center justify-center w-[18px] h-[18px] rounded bg-emerald-500 text-[10px] font-bold text-white leading-none">
                            A
                          </span>
                          <p className="text-[13px] text-rf-ink-500 leading-relaxed whitespace-pre-wrap">
                            {entry.answer || (
                              <span className="text-rf-text-muted italic">
                                No answer
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(entry.id);
                        }}
                        className="p-1.5 text-rf-ink-300 hover:text-rf-danger rounded-rf-sm transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Delete confirmation */}
                  {deleteConfirmId === entry.id && (
                    <div className="px-5 pb-4 pt-3 flex items-center gap-3 border-t border-rf-border">
                      <span className="text-sm text-rf-ink-500 flex-1">
                        Remove this Q&A entry?
                      </span>
                      <Button
                        variant="tertiary"
                        onClick={() => setDeleteConfirmId(null)}
                        disabled={saving}
                        className="px-3 py-1 text-xs"
                      >
                        Keep
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleDelete(entry.id)}
                        disabled={saving}
                        className="px-3 py-1 text-xs gap-1.5"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Deleting…
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* No search results */}
        {searchQuery && filteredEntries.length === 0 && (
          <div className="text-center py-12">
            <Search className="h-8 w-8 text-rf-ink-300 mx-auto mb-3 opacity-50" />
            <p className="text-sm text-rf-text-muted">
              No entries match &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        )}

        {/* Empty state */}
        {entries.length === 0 && !adding && (
          <div className="text-center py-20">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rf-blue-tint">
              <MessageCircleQuestion className="h-8 w-8 text-rf-blue" />
            </div>
            <h3 className="text-base font-bold text-rf-ink-900">
              No FAQs yet
            </h3>
            <p className="text-sm text-rf-text-muted mt-1.5 max-w-sm mx-auto leading-relaxed">
              Add questions and answers that AI will reference when communicating
              with applicants via email, text, or phone.
            </p>
            <Button
              variant="primary"
              onClick={() => setAdding(true)}
              className="mt-5 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add your first Q&A
            </Button>
          </div>
        )}
      </div>

      {/* Polishing overlay */}
      {polishing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="bg-rf-surface-card rounded-rf-xl shadow-rf-xl p-6 flex flex-col items-center gap-3 animate-[fadeSlideIn_200ms_ease-out]">
            <div className="relative">
              <Sparkles className="h-8 w-8 text-rf-blue animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-rf-ink-900">
                Polishing your Q&As
              </p>
              <p className="text-xs text-rf-text-muted mt-0.5">
                Improving clarity and tone…
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
