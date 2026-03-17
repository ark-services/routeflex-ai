"use client";

import { useState, useCallback } from "react";
import { Plus, Loader2, LayoutTemplate, Sparkles } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import QuestionCard, { QuestionData } from "./QuestionCard";
import {
  upsertScreeningConfig,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  applyTemplate,
} from "./actions";

type Template = { id: string; name: string; description: string | null };

type Config = {
  id: string;
  deadline_hours: number;
  auto_reject_dealbreakers: boolean;
};

type Props = {
  companyId: string;
  jobId: string;
  jobTitle: string;
  config: Config | null;
  initialQuestions: QuestionData[];
  templates: Template[];
};

function SortableQuestion({
  question,
  index,
  jobTitle,
  enhancingId,
  onUpdate,
  onDelete,
  onEnhance,
}: {
  question: QuestionData;
  index: number;
  jobTitle: string;
  enhancingId: string | null;
  onUpdate: (id: string, changes: Partial<QuestionData>) => void;
  onDelete: (id: string) => void;
  onEnhance: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <QuestionCard
        question={question}
        index={index}
        jobTitle={jobTitle}
        isEnhancing={enhancingId === question.id}
        dragHandleProps={{ ...attributes, ...listeners }}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onEnhance={onEnhance}
      />
    </div>
  );
}

export default function ScreeningBuilder({
  companyId,
  jobId,
  jobTitle,
  config: initialConfig,
  initialQuestions,
  templates,
}: Props) {
  const [questions, setQuestions] = useState<QuestionData[]>(initialQuestions);
  const [configId, setConfigId] = useState<string | null>(initialConfig?.id ?? null);
  const [deadlineHours, setDeadlineHours] = useState(initialConfig?.deadline_hours ?? 48);
  const [autoReject, setAutoReject] = useState(initialConfig?.auto_reject_dealbreakers ?? false);
  const [saving, setSaving] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [enhancingId, setEnhancingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleSaveConfig() {
    setSaving(true);
    try {
      await upsertScreeningConfig(jobId, companyId, {
        deadline_hours: deadlineHours,
        auto_reject_dealbreakers: autoReject,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddQuestion() {
    if (!configId) {
      setSaving(true);
      try {
        await upsertScreeningConfig(jobId, companyId, {
          deadline_hours: deadlineHours,
          auto_reject_dealbreakers: autoReject,
        });
        window.location.reload();
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      await addQuestion(configId, jobId, companyId, {
        text: "",
        type: "yes_no",
        sort_order: questions.length,
      });
      window.location.reload();
    } catch (err) {
      console.error("addQuestion failed:", err);
    }
  }

  const handleUpdateQuestion = useCallback(
    (id: string, changes: Partial<QuestionData>) => {
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, ...changes } : q))
      );
      if (id.startsWith("tmp-")) return;
      updateQuestion(id, jobId, companyId, changes).catch(console.error);
    },
    [jobId, companyId]
  );

  const handleDeleteQuestion = useCallback(
    (id: string) => {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      if (id.startsWith("tmp-")) return;
      deleteQuestion(id, jobId, companyId).catch(console.error);
    },
    [jobId, companyId]
  );

  const handleEnhanceQuestion = useCallback(
    async (id: string) => {
      const question = questions.find((q) => q.id === id);
      if (!question || enhancingId) return;
      setEnhancingId(id);
      try {
        const res = await fetch("/api/screening/enhance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, jobTitle }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("[enhance] failed:", errData.error);
          return;
        }
        const { question: enhanced } = await res.json();
        if (enhanced) {
          const changes: Partial<QuestionData> = {};
          if (enhanced.text && enhanced.text !== question.text) changes.text = enhanced.text;
          if (enhanced.options !== undefined) changes.options = enhanced.options;
          if (enhanced.ai_scoring_guidance !== undefined)
            changes.ai_scoring_guidance = enhanced.ai_scoring_guidance;
          if (Object.keys(changes).length > 0) {
            handleUpdateQuestion(id, changes);
          }
        }
      } catch (err) {
        console.error("[enhance] error:", err);
      } finally {
        setEnhancingId(null);
      }
    },
    [questions, enhancingId, jobTitle, handleUpdateQuestion]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    const reordered = arrayMove(questions, oldIndex, newIndex).map((q, i) => ({
      ...q,
      sort_order: i,
    }));

    setQuestions(reordered);
    reorderQuestions(
      reordered.map((q) => ({ id: q.id, sort_order: q.sort_order })),
      jobId,
      companyId
    ).catch(console.error);
  }

  async function handleApplyTemplate(templateId: string) {
    if (!configId) {
      alert("Please save your settings first.");
      return;
    }
    setApplyingTemplate(true);
    try {
      await applyTemplate(templateId, configId, jobId, companyId);
      setShowTemplateModal(false);
      window.location.reload();
    } catch (err) {
      console.error("applyTemplate failed:", err);
    } finally {
      setApplyingTemplate(false);
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Main: question list ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-rf-text-primary">
            Questions{" "}
            <span className="text-rf-text-muted font-normal">({questions.length})</span>
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-rf-border rounded-lg text-rf-text-secondary hover:text-rf-text-primary hover:border-rf-blue/50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              Apply Template
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium bg-white border border-rf-border rounded-lg text-rf-text-secondary hover:text-rf-text-primary hover:border-rf-blue/50 transition-colors flex items-center gap-1.5 shadow-sm"
              title="Coming soon"
              disabled
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate with AI
            </button>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="px-3 py-1.5 text-xs font-medium bg-rf-blue text-white rounded-lg hover:bg-rf-blue/90 flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Question
            </button>
          </div>
        </div>

        {/* Question list */}
        {questions.length === 0 ? (
          <div className="text-center py-12 bg-rf-surface-card border border-dashed border-rf-border rounded-lg">
            <p className="text-rf-text-muted text-sm">No questions yet.</p>
            <p className="text-rf-text-muted text-xs mt-1">
              Add questions manually or apply a template.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={questions.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {questions.map((q, i) => (
                  <SortableQuestion
                    key={q.id}
                    question={q}
                    index={i}
                    jobTitle={jobTitle}
                    enhancingId={enhancingId}
                    onUpdate={handleUpdateQuestion}
                    onDelete={handleDeleteQuestion}
                    onEnhance={handleEnhanceQuestion}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Bottom add button */}
        {questions.length > 0 && (
          <button
            type="button"
            onClick={handleAddQuestion}
            className="mt-4 w-full px-3 py-2 text-xs font-medium border border-dashed border-rf-border rounded-lg text-rf-text-muted hover:text-rf-text-primary hover:border-rf-blue/50 transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Question
          </button>
        )}
      </div>

      {/* ── Right: settings panel ── */}
      <div className="w-72 border-l border-rf-border bg-rf-surface-card flex flex-col flex-shrink-0">
        <div className="px-5 py-4 border-b border-rf-border">
          <h3 className="text-sm font-semibold text-rf-ink-900">Settings</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <section>
            <h4 className="text-xs font-semibold text-rf-text-muted uppercase tracking-wider mb-3">
              Completion Deadline
            </h4>
            <input
              type="number"
              min={1}
              max={720}
              value={deadlineHours}
              onChange={(e) => setDeadlineHours(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50"
            />
            <p className="text-xs text-rf-text-muted mt-1.5 leading-relaxed">
              Hours before an unanswered submission is marked expired.
            </p>
          </section>

          <section>
            <h4 className="text-xs font-semibold text-rf-text-muted uppercase tracking-wider mb-3">
              Dealbreakers
            </h4>
            <label className="flex items-start gap-3 cursor-pointer" onClick={() => setAutoReject(!autoReject)}>
              <div className="flex-shrink-0 mt-0.5">
                <div
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoReject ? "bg-rf-blue" : "bg-rf-ink-100"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-rf-surface-card transition-transform shadow-sm ${
                      autoReject ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-rf-ink-900">Auto-reject on dealbreaker failure</div>
                <p className="text-xs text-rf-text-muted mt-1 leading-relaxed">
                  Automatically reject applicants who fail a dealbreaker question.
                </p>
              </div>
            </label>
          </section>

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            className="w-full px-4 py-2 text-sm font-medium bg-rf-blue text-white rounded-lg hover:bg-rf-blue/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* ── Template modal ── */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-rf-surface-card rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-rf-border">
              <h3 className="font-semibold text-rf-text-primary">Apply Screening Template</h3>
              <p className="text-xs text-rf-text-muted mt-1">
                Questions will be copied to this job and can be edited independently.
              </p>
            </div>
            <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="text-sm text-rf-text-muted text-center py-4">
                  No templates available yet. Super admins can create screening templates in Super Admin → Screening.
                </p>
              ) : (
                templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleApplyTemplate(t.id)}
                    disabled={applyingTemplate}
                    className="w-full text-left px-4 py-3 rounded-lg border border-rf-border hover:border-rf-blue/50 hover:bg-rf-blue/5 transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-rf-text-primary">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-rf-text-muted mt-0.5">{t.description}</p>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="p-5 border-t border-rf-border flex justify-end">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 text-sm text-rf-text-secondary hover:text-rf-text-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
