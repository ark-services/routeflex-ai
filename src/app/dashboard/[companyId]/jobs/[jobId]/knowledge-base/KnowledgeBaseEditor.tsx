"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Sparkles,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  BookOpen,
  MessageCircleQuestion,
  Search,
  X,
  Check,
  Lightbulb,
  ChevronRight,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutomationOverlay } from "@/components/automations/AutomationOverlay";
import {
  createKnowledgeBaseEntry,
  updateKnowledgeBaseEntry,
  deleteKnowledgeBaseEntry,
  reorderKnowledgeBaseEntries,
  approveKBSuggestion,
  rejectKBSuggestion,
  type KBEntry,
  type KBSuggestion,
} from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

type AgentFilter = null | "__unassigned" | string;

interface KnowledgeBaseEditorProps {
  companyId: string;
  jobId: string;
  jobTitle: string;
  accountId: string;
  initialEntries: KBEntry[];
  agents: Agent[];
  initialSuggestions: KBSuggestion[];
  automations: any[];
  triggers: any[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SidebarItem({
  label,
  count,
  isSelected,
  onClick,
  muted = false,
}: {
  label: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-rf-md text-[13px] transition-colors ${
        isSelected
          ? "bg-rf-blue-tint text-rf-blue font-medium"
          : muted
            ? "text-rf-ink-500 hover:bg-rf-ink-50"
            : "text-rf-ink-700 hover:bg-rf-ink-50"
      }`}
    >
      <span>{label}</span>
      <span className="text-[11px] tabular-nums text-rf-ink-400">{count}</span>
    </button>
  );
}

function QAField({
  label,
  labelColor,
  labelText,
  value,
  onChange,
  rows,
  placeholder,
  inputRef,
}: {
  label: string;
  labelColor: string;
  labelText: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder: string;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1.5">
        <span
          className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded ${labelColor} text-[10px] font-bold text-white leading-none`}
        >
          {label}
        </span>
        {labelText}
      </label>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3.5 py-2.5 text-sm border border-rf-ink-100 rounded-rf-md bg-rf-surface-input text-rf-ink-900 focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 focus:bg-rf-surface-card resize-y transition-all placeholder:text-rf-ink-300"
        placeholder={placeholder}
      />
    </div>
  );
}

function AgentChips({
  agents,
  selectedIds,
  onChange,
  disabled = false,
}: {
  agents: Agent[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  if (agents.length === 0) return null;

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-rf-ink-500 uppercase tracking-wide mb-1.5">
        Assign to Agents
      </label>
      <div className="flex flex-wrap gap-1.5">
        {agents.map((agent) => {
          const active = selectedIds.includes(agent.id);
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => toggle(agent.id)}
              disabled={disabled}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                active
                  ? "bg-rf-blue text-white border-rf-blue shadow-rf-sm"
                  : "bg-white text-rf-ink-600 border-rf-ink-100 hover:border-rf-blue/40 hover:bg-rf-blue-tint/30"
              } disabled:opacity-50 disabled:cursor-default`}
            >
              <span className="text-[13px] leading-none">{agent.emoji}</span>
              {agent.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KnowledgeBaseEditor({
  companyId,
  jobId,
  jobTitle,
  accountId,
  initialEntries,
  agents,
  initialSuggestions,
  automations,
  triggers,
}: KnowledgeBaseEditorProps) {
  const [entries, setEntries] = useState<KBEntry[]>(initialEntries);
  const [suggestions, setSuggestions] =
    useState<KBSuggestion[]>(initialSuggestions);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentFilter>(null);

  // Add form
  const [adding, setAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newAgentIds, setNewAgentIds] = useState<string[]>([]);

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editAgentIds, setEditAgentIds] = useState<string[]>([]);

  // Suggestion review form
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewQuestion, setReviewQuestion] = useState("");
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [reviewAgentIds, setReviewAgentIds] = useState<string[]>([]);

  // Agents overlay
  const [agentsOpen, setAgentsOpen] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [polishingId, setPolishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const newQuestionRef = useRef<HTMLTextAreaElement>(null);
  const editQuestionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (adding && newQuestionRef.current) newQuestionRef.current.focus();
  }, [adding]);

  useEffect(() => {
    if (editingId && editQuestionRef.current) editQuestionRef.current.focus();
  }, [editingId]);

  // ─── Computed ───────────────────────────────────────────────────────────────

  const visibleEntries = useMemo(() => {
    let filtered = entries;
    if (selectedAgentId === "__unassigned") {
      filtered = entries.filter((e) => e.agent_ids.length === 0);
    } else if (selectedAgentId !== null) {
      filtered = entries.filter((e) => e.agent_ids.includes(selectedAgentId!));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.question.toLowerCase().includes(q) ||
          e.answer.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [entries, selectedAgentId, searchQuery]);

  const visibleSuggestions = useMemo(() => {
    if (selectedAgentId === "__unassigned")
      return suggestions.filter((s) => !s.agent_id);
    if (selectedAgentId !== null)
      return suggestions.filter((s) => s.agent_id === selectedAgentId);
    return suggestions;
  }, [suggestions, selectedAgentId]);

  const agentEntryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      for (const aid of entry.agent_ids) {
        map.set(aid, (map.get(aid) ?? 0) + 1);
      }
    }
    return map;
  }, [entries]);

  const agentSuggestionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of suggestions) {
      if (s.agent_id) {
        map.set(s.agent_id, (map.get(s.agent_id) ?? 0) + 1);
      }
    }
    return map;
  }, [suggestions]);

  const unassignedCount = useMemo(
    () => entries.filter((e) => e.agent_ids.length === 0).length,
    [entries]
  );

  const canReorder = selectedAgentId === null && !searchQuery;

  // Only show enabled agents for chip picker
  const enabledAgents = useMemo(
    () => agents.filter((a) => a.is_enabled),
    [agents]
  );

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleStartAdding = () => {
    setAdding(true);
    setError(null);
    setNewQuestion("");
    setNewAnswer("");
    setNewAgentIds(
      selectedAgentId && selectedAgentId !== "__unassigned"
        ? [selectedAgentId]
        : []
    );
  };

  const handleAdd = useCallback(async () => {
    if (!newQuestion.trim() && !newAnswer.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createKnowledgeBaseEntry(
        companyId,
        jobId,
        { question: newQuestion.trim(), answer: newAnswer.trim() },
        newAgentIds
      );
      setEntries((prev) => [...prev, created]);
      setAdding(false);
      setNewQuestion("");
      setNewAnswer("");
      setNewAgentIds([]);
    } catch (err: any) {
      setError(err.message || "Failed to add entry");
    } finally {
      setSaving(false);
    }
  }, [companyId, jobId, newQuestion, newAnswer, newAgentIds]);

  const handleStartEdit = useCallback((entry: KBEntry) => {
    setEditingId(entry.id);
    setEditQuestion(entry.question);
    setEditAnswer(entry.answer);
    setEditAgentIds(entry.agent_ids);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditQuestion("");
    setEditAnswer("");
    setEditAgentIds([]);
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
        { question: editQuestion.trim(), answer: editAnswer.trim() },
        editAgentIds
      );
      setEntries((prev) => prev.map((e) => (e.id === editingId ? updated : e)));
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || "Failed to update entry");
    } finally {
      setSaving(false);
    }
  }, [companyId, jobId, editingId, editQuestion, editAnswer, editAgentIds]);

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
    async (entryId: string) => {
      const idx = entries.findIndex((e) => e.id === entryId);
      if (idx <= 0) return;
      const next = [...entries];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      setEntries(next);
      try {
        await reorderKnowledgeBaseEntries(
          companyId,
          jobId,
          next.map((e) => e.id)
        );
      } catch (err: any) {
        setEntries(entries);
        setError(err.message || "Failed to reorder");
      }
    },
    [companyId, jobId, entries]
  );

  const handleMoveDown = useCallback(
    async (entryId: string) => {
      const idx = entries.findIndex((e) => e.id === entryId);
      if (idx >= entries.length - 1) return;
      const next = [...entries];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      setEntries(next);
      try {
        await reorderKnowledgeBaseEntries(
          companyId,
          jobId,
          next.map((e) => e.id)
        );
      } catch (err: any) {
        setEntries(entries);
        setError(err.message || "Failed to reorder");
      }
    },
    [companyId, jobId, entries]
  );

  const handlePolishEntry = useCallback(
    async (entryId: string) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return;
      setPolishingId(entryId);
      setError(null);
      try {
        const res = await fetch("/api/knowledge-base/polish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: [{ id: entry.id, question: entry.question, answer: entry.answer }],
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Polish failed (${res.status})`);
        }
        const { entries: polished } = await res.json();
        const p = polished[0];
        if (p && (p.question !== entry.question || p.answer !== entry.answer)) {
          const updated = await updateKnowledgeBaseEntry(companyId, jobId, entryId, {
            question: p.question,
            answer: p.answer,
          });
          setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
        }
      } catch (err: any) {
        setError(err.message || "Failed to polish entry");
      } finally {
        setPolishingId(null);
      }
    },
    [companyId, jobId, entries]
  );

  // Suggestion handlers
  const handleQuickApprove = useCallback(
    async (s: KBSuggestion) => {
      setSaving(true);
      try {
        const created = await approveKBSuggestion(
          companyId,
          jobId,
          s.id,
          { question: s.question, answer: s.answer },
          s.agent_id ? [s.agent_id] : []
        );
        setEntries((prev) => [...prev, created]);
        setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      } catch (err: any) {
        setError(err.message || "Failed to approve suggestion");
      } finally {
        setSaving(false);
      }
    },
    [companyId, jobId]
  );

  const handleDismissSuggestion = useCallback(
    async (suggestionId: string) => {
      setSaving(true);
      try {
        await rejectKBSuggestion(companyId, jobId, suggestionId);
        setSuggestions((prev) => prev.filter((x) => x.id !== suggestionId));
        if (reviewingId === suggestionId) setReviewingId(null);
      } catch (err: any) {
        setError(err.message || "Failed to dismiss suggestion");
      } finally {
        setSaving(false);
      }
    },
    [companyId, jobId, reviewingId]
  );

  const handleStartReview = useCallback((s: KBSuggestion) => {
    setReviewingId(s.id);
    setReviewQuestion(s.question);
    setReviewAnswer(s.answer);
    setReviewAgentIds(s.agent_id ? [s.agent_id] : []);
  }, []);

  const handleApproveReview = useCallback(async () => {
    if (!reviewingId) return;
    setSaving(true);
    try {
      const created = await approveKBSuggestion(
        companyId,
        jobId,
        reviewingId,
        { question: reviewQuestion.trim(), answer: reviewAnswer.trim() },
        reviewAgentIds
      );
      setEntries((prev) => [...prev, created]);
      setSuggestions((prev) => prev.filter((x) => x.id !== reviewingId));
      setReviewingId(null);
    } catch (err: any) {
      setError(err.message || "Failed to approve suggestion");
    } finally {
      setSaving(false);
    }
  }, [companyId, jobId, reviewingId, reviewQuestion, reviewAnswer, reviewAgentIds]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-rf-border bg-rf-surface-card flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-rf-lg bg-rf-blue-tint flex-shrink-0">
              <BookOpen className="h-[16px] w-[16px] text-rf-blue" />
            </div>
            <div>
              <h1 className="text-base font-bold text-rf-ink-900 leading-tight">
                Knowledge Base
              </h1>
              <p className="text-[12px] text-rf-text-muted leading-snug">
                FAQs for{" "}
                <span className="font-semibold text-rf-ink-700">{jobTitle}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAgentsOpen(true)}
              className="h-8 px-3 bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark hover:shadow-rf-md transition-all flex items-center gap-1.5 text-sm font-medium shadow-rf-sm"
            >
              <Users className="w-4 h-4 flex-shrink-0" />
              <span>Agents</span>
            </button>
            <Button
              variant="primary"
              onClick={handleStartAdding}
              disabled={adding}
              className="gap-1.5 text-xs h-8 px-3"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Q&amp;A
            </Button>
          </div>
        </div>
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-52 flex-shrink-0 border-r border-rf-border overflow-y-auto py-3 bg-white">
          <div className="px-2 space-y-0.5">
            <SidebarItem
              label="All Q&As"
              count={entries.length}
              isSelected={selectedAgentId === null}
              onClick={() => setSelectedAgentId(null)}
            />
          </div>

          {agents.length > 0 && (
            <>
              <div className="px-4 pt-4 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-rf-ink-300">
                  Agents
                </span>
              </div>
              <div className="px-2 space-y-0.5">
                {agents.map((agent) => {
                  const count = agentEntryCounts.get(agent.id) ?? 0;
                  const suggCount = agentSuggestionCounts.get(agent.id) ?? 0;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-rf-md text-[13px] transition-colors ${
                        selectedAgentId === agent.id
                          ? "bg-rf-blue-tint text-rf-blue font-medium"
                          : agent.is_enabled
                            ? "text-rf-ink-700 hover:bg-rf-ink-50"
                            : "text-rf-ink-400 hover:bg-rf-ink-50"
                      }`}
                    >
                      <span className="text-base leading-none flex-shrink-0">
                        {agent.emoji}
                      </span>
                      <span className="flex-1 text-left truncate">
                        {agent.name}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {suggCount > 0 && (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-[9px] font-bold text-white leading-none">
                            {suggCount}
                          </span>
                        )}
                        <span className="text-[11px] tabular-nums text-rf-ink-400">
                          {count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {unassignedCount > 0 && (
            <>
              <div className="mx-4 my-2.5 border-t border-rf-border" />
              <div className="px-2">
                <SidebarItem
                  label="Unassigned"
                  count={unassignedCount}
                  isSelected={selectedAgentId === "__unassigned"}
                  onClick={() => setSelectedAgentId("__unassigned")}
                  muted
                />
              </div>
            </>
          )}
        </div>

        {/* Main panel */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-5">
            {/* Error */}
            {error && (
              <div className="mb-4 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-rf-md text-sm text-red-700">
                <div className="mt-0.5 h-4 w-4 rounded-full bg-red-100 flex-shrink-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-red-600">!</span>
                </div>
                <div className="flex-1">{error}</div>
                <button
                  onClick={() => setError(null)}
                  className="p-0.5 text-red-400 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Search */}
            {(entries.length > 2 || searchQuery) && (
              <div className="mb-4 flex items-center gap-3">
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
                    ? `${visibleEntries.length} of ${entries.length}`
                    : `${visibleEntries.length}`}
                </span>
              </div>
            )}

            {/* Add form */}
            {adding && (
              <div className="mb-5 bg-rf-surface-card border-2 border-rf-blue/25 rounded-rf-lg shadow-rf-md overflow-hidden animate-[fadeSlideIn_200ms_ease-out]">
                <div className="px-5 py-3 bg-rf-blue-tint/50 border-b border-rf-blue/10">
                  <h3 className="text-sm font-semibold text-rf-blue flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    New Q&amp;A Entry
                  </h3>
                </div>
                <div className="p-5 space-y-4">
                  <QAField
                    label="Q"
                    labelColor="bg-rf-blue"
                    labelText="Question"
                    value={newQuestion}
                    onChange={setNewQuestion}
                    inputRef={newQuestionRef}
                    rows={2}
                    placeholder="e.g. What are the working hours?"
                  />
                  <QAField
                    label="A"
                    labelColor="bg-emerald-500"
                    labelText="Answer"
                    value={newAnswer}
                    onChange={setNewAnswer}
                    rows={4}
                    placeholder="Provide a clear, concise answer…"
                  />
                  <AgentChips
                    agents={enabledAgents}
                    selectedIds={newAgentIds}
                    onChange={setNewAgentIds}
                    disabled={saving}
                  />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      variant="tertiary"
                      onClick={() => {
                        setAdding(false);
                        setNewQuestion("");
                        setNewAnswer("");
                        setNewAgentIds([]);
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

            {/* Suggestions queue */}
            {visibleSuggestions.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2.5">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-semibold text-rf-ink-700">
                    Suggested Q&amp;As
                  </h2>
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">
                    {visibleSuggestions.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {visibleSuggestions.map((s) => (
                    <div
                      key={s.id}
                      className="bg-amber-50 border border-amber-200 rounded-rf-lg overflow-hidden"
                    >
                      {reviewingId === s.id ? (
                        /* Review & Edit form */
                        <div>
                          <div className="px-4 py-2.5 bg-amber-100/60 border-b border-amber-200 flex items-center justify-between">
                            <span className="text-xs font-semibold text-amber-800">
                              Review Suggestion
                            </span>
                            <button
                              onClick={() => setReviewingId(null)}
                              className="p-0.5 text-amber-400 hover:text-amber-700 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="p-4 space-y-3">
                            <QAField
                              label="Q"
                              labelColor="bg-rf-blue"
                              labelText="Question"
                              value={reviewQuestion}
                              onChange={setReviewQuestion}
                              rows={2}
                              placeholder="Question"
                            />
                            <QAField
                              label="A"
                              labelColor="bg-emerald-500"
                              labelText="Answer"
                              value={reviewAnswer}
                              onChange={setReviewAnswer}
                              rows={3}
                              placeholder="Answer"
                            />
                            <AgentChips
                              agents={enabledAgents}
                              selectedIds={reviewAgentIds}
                              onChange={setReviewAgentIds}
                              disabled={saving}
                            />
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <button
                                onClick={() => handleDismissSuggestion(s.id)}
                                disabled={saving}
                                className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                              >
                                Reject
                              </button>
                              <Button
                                variant="primary"
                                onClick={handleApproveReview}
                                disabled={saving}
                                className="px-4 py-1 text-xs gap-1.5"
                              >
                                {saving ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                Approve &amp; Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Suggestion preview */
                        <div className="p-4">
                          {s.automation_agents && (
                            <div className="flex items-center gap-1.5 mb-2.5">
                              <span className="text-sm leading-none">
                                {s.automation_agents.emoji}
                              </span>
                              <span className="text-xs font-medium text-amber-700">
                                {s.automation_agents.name}
                              </span>
                              <span className="text-xs text-amber-500">
                                suggests
                              </span>
                            </div>
                          )}
                          <div className="space-y-1.5 mb-3">
                            <div className="flex items-start gap-2">
                              <span className="mt-[3px] flex-shrink-0 inline-flex items-center justify-center w-[16px] h-[16px] rounded bg-rf-blue text-[9px] font-bold text-white leading-none">
                                Q
                              </span>
                              <p className="text-[13px] font-medium text-rf-ink-900 leading-snug">
                                {s.question || (
                                  <span className="italic text-rf-text-muted font-normal">
                                    No question
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="mt-[3px] flex-shrink-0 inline-flex items-center justify-center w-[16px] h-[16px] rounded bg-emerald-500 text-[9px] font-bold text-white leading-none">
                                A
                              </span>
                              <p className="text-[12px] text-rf-ink-500 leading-relaxed line-clamp-3">
                                {s.answer || (
                                  <span className="italic text-rf-text-muted">
                                    No answer
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleQuickApprove(s)}
                              disabled={saving}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-500 text-white rounded-full hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                            >
                              <Check className="h-3 w-3" />
                              Quick Approve
                            </button>
                            <button
                              onClick={() => handleStartReview(s)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white text-amber-700 border border-amber-300 rounded-full hover:bg-amber-50 transition-colors"
                            >
                              Review &amp; Edit
                              <ChevronRight className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDismissSuggestion(s.id)}
                              disabled={saving}
                              className="ml-auto px-2 py-1 text-xs text-amber-500 hover:text-amber-700 transition-colors disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section heading when filtered */}
            {selectedAgentId !== null && (
              <div className="mb-3">
                {selectedAgentId === "__unassigned" ? (
                  <h2 className="text-sm font-semibold text-rf-ink-500">
                    Unassigned Q&amp;As
                  </h2>
                ) : (
                  (() => {
                    const agent = agents.find((a) => a.id === selectedAgentId);
                    return agent ? (
                      <h2 className="text-sm font-semibold text-rf-ink-700 flex items-center gap-1.5">
                        <span>{agent.emoji}</span>
                        {agent.name}
                      </h2>
                    ) : null;
                  })()
                )}
              </div>
            )}

            {/* Q&A entry list */}
            <div className="space-y-3">
              {visibleEntries.map((entry) => {
                const globalIndex = entries.findIndex((e) => e.id === entry.id);
                const isPolishing = polishingId === entry.id;
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
                      /* Edit mode */
                      <div>
                        <div className="px-5 py-3 bg-rf-blue-tint/40 border-b border-rf-blue/10">
                          <span className="text-xs font-semibold text-rf-blue">
                            Editing
                          </span>
                        </div>
                        <div className="p-5 space-y-4">
                          <QAField
                            label="Q"
                            labelColor="bg-rf-blue"
                            labelText="Question"
                            value={editQuestion}
                            onChange={setEditQuestion}
                            inputRef={editQuestionRef}
                            rows={2}
                            placeholder="e.g. What are the working hours?"
                          />
                          <QAField
                            label="A"
                            labelColor="bg-emerald-500"
                            labelText="Answer"
                            value={editAnswer}
                            onChange={setEditAnswer}
                            rows={4}
                            placeholder="Provide a clear, concise answer…"
                          />
                          <AgentChips
                            agents={enabledAgents}
                            selectedIds={editAgentIds}
                            onChange={setEditAgentIds}
                            disabled={saving}
                          />
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
                      /* Display mode */
                      <>
                        <div
                          className="p-4 cursor-pointer"
                          onClick={() => handleStartEdit(entry)}
                        >
                          <div className="flex items-start gap-3">
                            {/* Reorder controls */}
                            {canReorder && (
                              <div className="flex flex-col items-center gap-0.5 pt-px select-none">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveUp(entry.id);
                                  }}
                                  disabled={globalIndex === 0}
                                  className="p-0.5 text-rf-ink-300 hover:text-rf-ink-700 disabled:opacity-0 disabled:cursor-default transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <span className="text-[11px] font-bold text-rf-ink-300 tabular-nums w-5 text-center">
                                  {globalIndex + 1}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveDown(entry.id);
                                  }}
                                  disabled={globalIndex === entries.length - 1}
                                  className="p-0.5 text-rf-ink-300 hover:text-rf-ink-700 disabled:opacity-0 disabled:cursor-default transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}

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
                              {/* Agent badges */}
                              {entry.agent_ids.length > 0 && (
                                <div className="mt-2.5 flex flex-wrap gap-1">
                                  {entry.agent_ids.map((aid) => {
                                    const agent = agents.find(
                                      (a) => a.id === aid
                                    );
                                    if (!agent) return null;
                                    return (
                                      <span
                                        key={aid}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rf-blue-tint text-rf-blue border border-rf-blue/15"
                                      >
                                        <span className="text-[11px] leading-none">
                                          {agent.emoji}
                                        </span>
                                        {agent.name}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Polish button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePolishEntry(entry.id);
                                }}
                                disabled={isPolishing || saving}
                                className="p-1.5 text-rf-ink-300 hover:text-rf-blue rounded-rf-sm transition-colors disabled:opacity-50"
                                title="Polish with AI"
                              >
                                {isPolishing ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Sparkles className="h-4 w-4" />
                                )}
                              </button>
                              {/* Delete button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(entry.id);
                                }}
                                className="p-1.5 text-rf-ink-300 hover:text-rf-danger rounded-rf-sm transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Delete confirm */}
                        {deleteConfirmId === entry.id && (
                          <div className="px-5 pb-4 pt-3 flex items-center gap-3 border-t border-rf-border">
                            <span className="text-sm text-rf-ink-500 flex-1">
                              Remove this Q&amp;A entry?
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
                                <Loader2 className="h-3 w-3 animate-spin" />
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
              {searchQuery && visibleEntries.length === 0 && (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 text-rf-ink-300 mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-rf-text-muted">
                    No entries match &ldquo;{searchQuery}&rdquo;
                  </p>
                </div>
              )}

              {/* Empty state */}
              {visibleEntries.length === 0 && !searchQuery && !adding && (
                <div className="text-center py-16">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rf-blue-tint">
                    <MessageCircleQuestion className="h-7 w-7 text-rf-blue" />
                  </div>
                  <h3 className="text-base font-bold text-rf-ink-900">
                    {selectedAgentId === "__unassigned"
                      ? "No unassigned Q&As"
                      : selectedAgentId
                        ? "No Q&As for this agent"
                        : "No FAQs yet"}
                  </h3>
                  <p className="text-sm text-rf-text-muted mt-1.5 max-w-xs mx-auto leading-relaxed">
                    {selectedAgentId
                      ? "Add a Q&A and assign it to this agent."
                      : "Add questions and answers that AI will reference when communicating with applicants."}
                  </p>
                  <Button
                    variant="primary"
                    onClick={handleStartAdding}
                    className="mt-4 gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Add Q&amp;A
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Agents overlay */}
      <AutomationOverlay
        isOpen={agentsOpen}
        onClose={() => setAgentsOpen(false)}
        companyId={companyId}
        jobId={jobId}
        jobTitle={jobTitle}
        accountId={accountId}
        automations={automations}
        triggers={triggers}
        groups={[]}
        agents={agents}
      />
    </div>
  );
}
