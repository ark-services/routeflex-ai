"use client";

import { useState, useCallback } from "react";
import { Plus, Loader2 } from "lucide-react";
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
import QuestionCard, { QuestionData } from "@/app/dashboard/[companyId]/jobs/[jobId]/screening/QuestionCard";
import {
  updateTemplate,
  addTemplateQuestion,
  updateTemplateQuestion,
  deleteTemplateQuestion,
  reorderTemplateQuestions,
} from "./actions";

type Template = { id: string; name: string; description: string | null; is_active: boolean };

type Props = {
  template: Template;
  initialQuestions: QuestionData[];
};

function SortableQuestion({
  question,
  index,
  onUpdate,
  onDelete,
}: {
  question: QuestionData;
  index: number;
  onUpdate: (id: string, changes: Partial<QuestionData>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <QuestionCard
        question={question}
        index={index}
        dragHandleProps={{ ...attributes, ...listeners }}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </div>
  );
}

export default function TemplateEditor({ template, initialQuestions }: Props) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [isActive, setIsActive] = useState(template.is_active);
  const [questions, setQuestions] = useState<QuestionData[]>(initialQuestions);
  const [savingMeta, setSavingMeta] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleSaveMeta() {
    setSavingMeta(true);
    try {
      await updateTemplate(template.id, {
        name,
        description: description || null,
        is_active: isActive,
      });
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleAddQuestion() {
    try {
      await addTemplateQuestion(template.id, {
        text: "",
        type: "yes_no",
        sort_order: questions.length,
      });
      window.location.reload();
    } catch (err) {
      console.error("addTemplateQuestion failed:", err);
    }
  }

  const handleUpdateQuestion = useCallback(
    (id: string, changes: Partial<QuestionData>) => {
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, ...changes } : q))
      );
      if (!id.startsWith("tmp-")) {
        updateTemplateQuestion(id, template.id, changes).catch(console.error);
      }
    },
    [template.id]
  );

  const handleDeleteQuestion = useCallback(
    (id: string) => {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      if (!id.startsWith("tmp-")) {
        deleteTemplateQuestion(id, template.id).catch(console.error);
      }
    },
    [template.id]
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
    reorderTemplateQuestions(
      reordered.map((q) => ({ id: q.id, sort_order: q.sort_order })),
      template.id
    ).catch(console.error);
  }

  return (
    <div className="space-y-6">
      {/* Meta */}
      <div className="bg-rf-surface-card border border-rf-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-rf-text-primary">Template Details</h2>
        <div>
          <label className="block text-xs font-medium text-rf-text-secondary mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-rf-text-secondary mb-1">
            Description <span className="text-rf-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50 resize-none"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-rf-border text-rf-blue focus:ring-rf-blue/50"
          />
          <span className="text-sm text-rf-text-primary">Active (visible to DSP owners)</span>
        </label>
        <button
          type="button"
          onClick={handleSaveMeta}
          disabled={savingMeta}
          className="px-4 py-2 text-sm font-medium bg-rf-blue text-white rounded-lg hover:bg-rf-blue/90 disabled:opacity-50 flex items-center gap-2"
        >
          {savingMeta && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {savingMeta ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Questions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-rf-text-primary">
            Questions{" "}
            <span className="text-rf-text-muted font-normal">({questions.length})</span>
          </h2>
          <button
            type="button"
            onClick={handleAddQuestion}
            className="px-3 py-1.5 text-xs font-medium bg-rf-blue text-white rounded-lg hover:bg-rf-blue/90 flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Question
          </button>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-12 bg-rf-surface-card border border-dashed border-rf-border rounded-lg">
            <p className="text-rf-text-muted text-sm">No questions yet.</p>
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
                    onUpdate={handleUpdateQuestion}
                    onDelete={handleDeleteQuestion}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
