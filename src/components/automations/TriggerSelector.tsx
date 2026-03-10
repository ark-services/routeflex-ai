"use client";

import { useState } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import type { Trigger, Column, Group, FilterCondition } from "./automations-types";
import { TEXT_COL_TYPES, parseSimplePattern, buildSimplePattern } from "./automations-types";
import { ColumnPicker, StatusLabelPicker, GroupPicker } from "./Pickers";
import { FilterConditionRow } from "./FilterConditionRow";

export function TriggerSelector({
  triggers,
  selectedTrigger,
  onSelect,
  triggerConfig,
  onConfigChange,
  columns,
  groups,
  filterConditions = [],
  onFilterConditionsChange,
  bodyExtractAdvanced = false,
  onBodyExtractAdvancedChange,
}: {
  triggers: Trigger[];
  selectedTrigger: Trigger | null;
  onSelect: (trigger: Trigger | null) => void;
  triggerConfig: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  columns: Column[];
  groups: Group[];
  filterConditions?: FilterCondition[];
  onFilterConditionsChange?: (conditions: FilterCondition[]) => void;
  bodyExtractAdvanced?: boolean;
  onBodyExtractAdvancedChange?: (v: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  // Monday.com-style triggers to show first
  const priorityTriggers = [
    "board.status_changes_to",
    "applicant.moved_group",
    "applicant.created",
    "form.submitted",
  ];

  const sortedTriggers = [...triggers].sort((a, b) => {
    const aIndex = priorityTriggers.indexOf(a.key);
    const bIndex = priorityTriggers.indexOf(b.key);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return 0;
  });

  if (!selectedTrigger) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-4 py-2.5 border border-rf-border rounded-lg text-left flex items-center justify-between hover:border-rf-ink-300 transition-colors bg-rf-surface-card text-sm"
        >
          <span className="text-rf-text-muted">When this happens...</span>
          <ChevronDown className="w-4 h-4 text-rf-text-muted" />
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
            {sortedTriggers.map((trigger) => (
              <button
                key={trigger.id}
                onClick={() => {
                  onSelect(trigger);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-rf-blue-tint transition-colors border-b border-rf-border last:border-b-0"
              >
                <p className="text-sm font-medium text-rf-ink-900">{trigger.name}</p>
                {trigger.description && (
                  <p className="text-xs text-rf-text-muted mt-0.5">{trigger.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Render interactive sentence for selected trigger
  return (
    <div className="border border-rf-blue-tint bg-rf-blue-tint/60 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5 text-sm flex-1 min-w-0">
          {/* Interactive Sentence */}
          {selectedTrigger.key === "board.status_changes_to" && (
            <>
              <span className="text-rf-text-secondary">When</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "status")}
                selectedId={triggerConfig.column_id}
                onSelect={(id) => onConfigChange({ ...triggerConfig, column_id: id, changes_to: undefined })}
                placeholder="status column"
              />
              <span className="text-rf-text-secondary">changes to</span>
              {triggerConfig.column_id && (
                <StatusLabelPicker
                  column={columns.find((c) => c.id === triggerConfig.column_id)}
                  selectedId={triggerConfig.changes_to}
                  onSelect={(id) => onConfigChange({ ...triggerConfig, changes_to: id })}
                  placeholder="value"
                />
              )}
            </>
          )}

          {selectedTrigger.key === "applicant.moved_group" && (
            <>
              <span className="text-rf-text-secondary">When applicant moved to</span>
              <GroupPicker
                groups={groups}
                selectedId={triggerConfig.to_group_id}
                onSelect={(id) => onConfigChange({ ...triggerConfig, to_group_id: id })}
                placeholder="group"
                allowAny
              />
            </>
          )}

          {selectedTrigger.key === "applicant.created" && (
            <span className="text-rf-text-secondary">When applicant is created</span>
          )}

          {selectedTrigger.key === "form.submitted" && (
            <span className="text-rf-text-secondary">When application form is submitted</span>
          )}

          {selectedTrigger.key === "gmail.email_received" && (
            <span className="text-rf-text-secondary">When a matching email is received in Gmail</span>
          )}

          {/* Fallback for any trigger without a custom sentence */}
          {!["board.status_changes_to", "applicant.moved_group", "applicant.created", "form.submitted", "gmail.email_received"].includes(selectedTrigger.key) && (
            <span className="text-rf-text-secondary">When {selectedTrigger.name.toLowerCase()}</span>
          )}
        </div>

        <button
          onClick={() => onSelect(null)}
          className="p-1 hover:bg-rf-blue-tint rounded ml-2 flex-shrink-0"
        >
          <X className="w-3.5 h-3.5 text-rf-text-muted" />
        </button>
      </div>

      {/* Gmail trigger config */}
      {selectedTrigger.key === "gmail.email_received" && (
        <div className="mt-3 pt-3 border-t border-rf-blue-tint space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-rf-text-muted w-28 shrink-0">Sender contains</span>
            <input
              type="text"
              value={triggerConfig.sender_contains ?? ""}
              onChange={(e) => onConfigChange({ ...triggerConfig, sender_contains: e.target.value })}
              placeholder="e.g. do_not_reply@fadv.com"
              className="flex-1 px-2 py-1 text-xs border border-rf-border rounded focus:ring-1 focus:ring-rf-blue focus:border-rf-blue outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-rf-text-muted w-28 shrink-0">Subject contains</span>
            <input
              type="text"
              value={triggerConfig.subject_contains ?? ""}
              onChange={(e) => onConfigChange({ ...triggerConfig, subject_contains: e.target.value })}
              placeholder="e.g. Application Completed"
              className="flex-1 px-2 py-1 text-xs border border-rf-border rounded focus:ring-1 focus:ring-rf-blue focus:border-rf-blue outline-none"
            />
          </div>

          <div className="pt-1.5 border-t border-rf-blue-tint/50">
            <span className="text-xs font-medium text-rf-text-secondary">Match to applicant by:</span>
            <div className="mt-1.5 space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="match_applicant_by"
                  checked={triggerConfig.match_applicant_by === "sender_email"}
                  onChange={() => onConfigChange({ ...triggerConfig, match_applicant_by: "sender_email", body_extract_pattern: undefined, match_column_id: undefined })}
                  className="text-rf-blue"
                />
                <span className="text-xs text-rf-text-secondary">Sender email matches applicant&apos;s email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="match_applicant_by"
                  checked={triggerConfig.match_applicant_by === "body_extract"}
                  onChange={() => {
                    onConfigChange({ ...triggerConfig, match_applicant_by: "body_extract" });
                    onBodyExtractAdvancedChange?.(false);
                  }}
                  className="text-rf-blue"
                />
                <span className="text-xs text-rf-text-secondary">Extract value from email body</span>
              </label>
            </div>

            {triggerConfig.match_applicant_by === "body_extract" && (
              <div className="mt-2 ml-5 space-y-2">
                {bodyExtractAdvanced ? (
                  /* Advanced: raw regex input */
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rf-text-muted w-24 shrink-0">Body pattern</span>
                    <input
                      type="text"
                      value={triggerConfig.body_extract_pattern ?? ""}
                      onChange={(e) => onConfigChange({ ...triggerConfig, body_extract_pattern: e.target.value })}
                      placeholder={String.raw`e.g. Applicant ID:\s*(\S+)`}
                      className="flex-1 px-2 py-1 text-xs border border-rf-border rounded font-mono focus:ring-1 focus:ring-rf-blue focus:border-rf-blue outline-none"
                    />
                  </div>
                ) : (
                  /* Simple: prefix + optional suffix inputs */
                  (() => {
                    const parsed = parseSimplePattern(triggerConfig.body_extract_pattern ?? "");
                    const prefix = parsed?.prefix ?? "";
                    const suffix = parsed?.suffix ?? "";
                    const update = (newPrefix: string, newSuffix: string) => {
                      onConfigChange({ ...triggerConfig, body_extract_pattern: buildSimplePattern(newPrefix, newSuffix) });
                    };
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-rf-text-muted w-24 shrink-0">Value comes after</span>
                          <input
                            type="text"
                            value={prefix}
                            onChange={(e) => update(e.target.value, suffix)}
                            placeholder='e.g. "Applicant ID:" or "Status:"'
                            className="flex-1 px-2 py-1 text-xs border border-rf-border rounded focus:ring-1 focus:ring-rf-blue focus:border-rf-blue outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-rf-text-muted w-24 shrink-0">Value ends before</span>
                          <input
                            type="text"
                            value={suffix}
                            onChange={(e) => update(prefix, e.target.value)}
                            placeholder='optional \u2014 e.g. "|" or "." (blank = single word)'
                            className="flex-1 px-2 py-1 text-xs border border-rf-border rounded focus:ring-1 focus:ring-rf-blue focus:border-rf-blue outline-none"
                          />
                        </div>
                        {triggerConfig.body_extract_pattern && (
                          <p className="text-[10px] text-rf-text-muted font-mono pl-[104px]">
                            \u21b3 {triggerConfig.body_extract_pattern}
                          </p>
                        )}
                      </div>
                    );
                  })()
                )}

                <div className="flex items-center gap-2">
                  <span className="text-xs text-rf-text-muted w-24 shrink-0">Match to column</span>
                  <ColumnPicker
                    columns={columns.filter(
                      (c) => TEXT_COL_TYPES.includes(c.type) || c.type.startsWith("fadv.")
                    )}
                    selectedId={triggerConfig.match_column_id}
                    onSelect={(id) => onConfigChange({ ...triggerConfig, match_column_id: id })}
                    placeholder="column"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-rf-text-muted">
                    {bodyExtractAdvanced
                      ? "Use a capture group to extract the value. Also checks FADV Applicant IDs automatically."
                      : "Extracts the word after that label. Also checks FADV Applicant IDs automatically."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (bodyExtractAdvanced) {
                        // Switching to simple: if pattern isn't parseable, clear it first
                        if (
                          triggerConfig.body_extract_pattern &&
                          parseSimplePattern(triggerConfig.body_extract_pattern) === null
                        ) {
                          onConfigChange({ ...triggerConfig, body_extract_pattern: "" });
                        }
                      }
                      onBodyExtractAdvancedChange?.(!bodyExtractAdvanced);
                    }}
                    className="text-[10px] text-rf-blue hover:underline shrink-0 ml-2"
                  >
                    {bodyExtractAdvanced ? "\u2190 Simple mode" : "Advanced (regex) \u2192"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline "and only if..." conditions */}
      {onFilterConditionsChange && (
        filterConditions.length === 0 ? (
          <button
            onClick={() => onFilterConditionsChange([{ type: "is_not_empty", column_id: undefined, value: "" }])}
            className="text-xs text-rf-blue-light hover:text-rf-blue transition-colors flex items-center gap-1 mt-2"
          >
            <Plus className="w-3 h-3" />
            and only if...
          </button>
        ) : (
          <div className="mt-2 pt-2 border-t border-rf-blue-tint">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-rf-blue">and only if...</span>
              <button
                onClick={() => onFilterConditionsChange([...filterConditions, { type: "is_not_empty", column_id: undefined, value: "" }])}
                className="text-xs text-rf-blue hover:text-rf-blue flex items-center gap-0.5 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {filterConditions.map((cond, index) => (
                <FilterConditionRow
                  key={index}
                  condition={cond}
                  columns={columns}
                  groups={groups}
                  onChange={(updates) => {
                    const next = [...filterConditions];
                    next[index] = { ...next[index], ...updates };
                    onFilterConditionsChange(next);
                  }}
                  onRemove={() => onFilterConditionsChange(filterConditions.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
