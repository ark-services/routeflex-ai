"use client";

import { useState } from "react";
import { Trash2, GripVertical, ChevronDown, ChevronUp, Plus, X } from "lucide-react";

type QuestionOption = { id: string; label: string };

export type QuestionData = {
  id: string;
  sort_order: number;
  text: string;
  type: "multiple_choice" | "short_text" | "yes_no" | "number";
  options: QuestionOption[] | null;
  is_dealbreaker: boolean;
  dealbreaker_condition: Record<string, any> | null;
  ai_scoring_guidance: string | null;
};

type Props = {
  question: QuestionData;
  index: number;
  dragHandleProps?: Record<string, any>;
  onUpdate: (id: string, changes: Partial<QuestionData>) => void;
  onDelete: (id: string) => void;
};

const TYPE_LABELS: Record<string, string> = {
  yes_no: "Yes / No",
  multiple_choice: "Multiple Choice",
  short_text: "Short Text",
  number: "Number",
};

export default function QuestionCard({
  question,
  index,
  dragHandleProps,
  onUpdate,
  onDelete,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [newOptionLabel, setNewOptionLabel] = useState("");

  function addOption() {
    if (!newOptionLabel.trim()) return;
    const opts = question.options ?? [];
    const id = String.fromCharCode(97 + opts.length); // a, b, c, ...
    onUpdate(question.id, { options: [...opts, { id, label: newOptionLabel.trim() }] });
    setNewOptionLabel("");
  }

  function removeOption(optId: string) {
    onUpdate(question.id, {
      options: (question.options ?? []).filter((o) => o.id !== optId),
    });
  }

  // Dealbreaker condition display
  const conditionValue =
    question.type === "yes_no"
      ? question.dealbreaker_condition?.answer ?? ""
      : question.type === "multiple_choice"
      ? question.dealbreaker_condition?.answer ?? ""
      : question.type === "number"
      ? JSON.stringify(question.dealbreaker_condition ?? {})
      : "";

  return (
    <div className="bg-rf-surface-card border border-rf-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div
          {...dragHandleProps}
          suppressHydrationWarning
          className="cursor-grab text-rf-text-muted hover:text-rf-text-secondary flex-shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <span className="text-xs text-rf-text-muted w-5 text-center flex-shrink-0">
          {index + 1}
        </span>
        <span className="flex-1 text-sm font-medium text-rf-text-primary truncate">
          {question.text || "Untitled question"}
        </span>
        <span className="text-xs text-rf-text-muted bg-rf-surface-page px-2 py-0.5 rounded border border-rf-border flex-shrink-0">
          {TYPE_LABELS[question.type]}
        </span>
        {question.is_dealbreaker && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex-shrink-0">
            Dealbreaker
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-rf-text-muted hover:text-rf-text-secondary flex-shrink-0"
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onDelete(question.id)}
          className="text-rf-text-muted hover:text-red-500 flex-shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-rf-border px-4 py-4 space-y-4">
          {/* Question text */}
          <div>
            <label className="block text-xs font-medium text-rf-text-secondary mb-1">
              Question
            </label>
            <textarea
              rows={2}
              value={question.text}
              onChange={(e) => onUpdate(question.id, { text: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50 resize-none"
              placeholder="Enter your question..."
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-rf-text-secondary mb-1">
              Answer Type
            </label>
            <select
              value={question.type}
              onChange={(e) =>
                onUpdate(question.id, {
                  type: e.target.value as QuestionData["type"],
                  options: e.target.value === "multiple_choice" ? (question.options ?? []) : null,
                  dealbreaker_condition: null,
                })
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50"
            >
              <option value="yes_no">Yes / No</option>
              <option value="multiple_choice">Multiple Choice</option>
              <option value="short_text">Short Text</option>
              <option value="number">Number</option>
            </select>
          </div>

          {/* Options (multiple choice) */}
          {question.type === "multiple_choice" && (
            <div>
              <label className="block text-xs font-medium text-rf-text-secondary mb-2">
                Options
              </label>
              <div className="space-y-2 mb-2">
                {(question.options ?? []).map((opt) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <span className="text-xs text-rf-text-muted w-4">{opt.id}.</span>
                    <span className="flex-1 text-sm text-rf-text-primary">{opt.label}</span>
                    <button
                      type="button"
                      onClick={() => removeOption(opt.id)}
                      className="text-rf-text-muted hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newOptionLabel}
                  onChange={(e) => setNewOptionLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                  placeholder="Add option..."
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50"
                />
                <button
                  type="button"
                  onClick={addOption}
                  className="px-3 py-1.5 text-sm bg-rf-surface-page border border-rf-border rounded-lg text-rf-text-secondary hover:text-rf-text-primary hover:border-rf-blue/50 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Dealbreaker */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={question.is_dealbreaker}
                onChange={(e) =>
                  onUpdate(question.id, {
                    is_dealbreaker: e.target.checked,
                    dealbreaker_condition: e.target.checked ? question.dealbreaker_condition : null,
                  })
                }
                className="rounded border-rf-border text-rf-blue focus:ring-rf-blue/50"
              />
              <span className="text-sm text-rf-text-primary">Dealbreaker</span>
              <span className="text-xs text-rf-text-muted">
                — auto-reject if this condition is met
              </span>
            </label>

            {question.is_dealbreaker && question.type !== "short_text" && (
              <div className="pl-6">
                <label className="block text-xs font-medium text-rf-text-secondary mb-1">
                  Fail condition
                </label>
                {question.type === "yes_no" && (
                  <select
                    value={question.dealbreaker_condition?.answer ?? ""}
                    onChange={(e) =>
                      onUpdate(question.id, {
                        dealbreaker_condition: e.target.value ? { answer: e.target.value } : null,
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50"
                  >
                    <option value="">Select...</option>
                    <option value="yes">Answer is Yes</option>
                    <option value="no">Answer is No</option>
                  </select>
                )}
                {question.type === "multiple_choice" && (
                  <select
                    value={question.dealbreaker_condition?.answer ?? ""}
                    onChange={(e) =>
                      onUpdate(question.id, {
                        dealbreaker_condition: e.target.value ? { answer: e.target.value } : null,
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50"
                  >
                    <option value="">Select...</option>
                    {(question.options ?? []).map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
                {question.type === "number" && (
                  <div className="flex gap-2">
                    <select
                      value={question.dealbreaker_condition?.operator ?? ""}
                      onChange={(e) =>
                        onUpdate(question.id, {
                          dealbreaker_condition: {
                            ...question.dealbreaker_condition,
                            operator: e.target.value,
                          },
                        })
                      }
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50"
                    >
                      <option value="">Operator...</option>
                      <option value="lt">Less than</option>
                      <option value="lte">Less than or equal</option>
                      <option value="gt">Greater than</option>
                      <option value="gte">Greater than or equal</option>
                      <option value="eq">Equal to</option>
                    </select>
                    <input
                      type="number"
                      value={question.dealbreaker_condition?.value ?? ""}
                      onChange={(e) =>
                        onUpdate(question.id, {
                          dealbreaker_condition: {
                            ...question.dealbreaker_condition,
                            value: Number(e.target.value),
                          },
                        })
                      }
                      placeholder="Value"
                      className="w-24 px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Scoring Guidance */}
          <div>
            <label className="block text-xs font-medium text-rf-text-secondary mb-1">
              AI Scoring Guidance{" "}
              <span className="text-rf-text-muted font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={question.ai_scoring_guidance ?? ""}
              onChange={(e) =>
                onUpdate(question.id, {
                  ai_scoring_guidance: e.target.value || null,
                })
              }
              placeholder="Instructions for how AI should evaluate this response..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-rf-border bg-rf-surface-page text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
