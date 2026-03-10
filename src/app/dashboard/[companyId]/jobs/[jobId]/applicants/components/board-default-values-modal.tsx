"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { setBoardDefaultValues } from "../actions";
import type { BoardColumn, StatusLabel } from "./types";

export function BoardDefaultValuesModal({
  companyId,
  jobId,
  columns,
  labelsByColumn,
  onSaved,
  onClose,
}: {
  companyId: string;
  jobId: string;
  columns: BoardColumn[];
  labelsByColumn: Map<string, StatusLabel[]>;
  onSaved: (updates: { columnId: string; defaultValue: any }[]) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  // Local draft state: columnId -> value (null = cleared)
  const [draft, setDraft] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const col of columns) {
      const dv = (col.settings as any)?.default_value;
      if (dv != null) init[col.id] = dv;
    }
    return init;
  });

  function setValue(columnId: string, value: any) {
    setDraft(prev => ({ ...prev, [columnId]: value }));
  }

  function clearValue(columnId: string) {
    setDraft(prev => {
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
  }

  function handleSave() {
    // Build full update list: all columns, set to draft value or null to clear
    const updates = columns.map(col => ({
      columnId: col.id,
      defaultValue: draft[col.id] ?? null,
    }));

    startTransition(async () => {
      await setBoardDefaultValues(companyId, jobId, updates);
      onSaved(updates);
      onClose();
    });
  }

  function handleClearAll() {
    setDraft({});
  }

  const hasAnyDefault = Object.keys(draft).length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-[10px] border border-rf-border bg-rf-surface-card p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-rf-text-primary">Default values for new items</h3>
          <div className="flex items-center gap-3">
            {hasAnyDefault && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-sm text-rf-text-muted hover:text-rf-danger transition-colors"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-rf-text-muted hover:text-rf-text-primary transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="text-sm text-rf-text-muted mb-5">
          These values are pre-filled whenever a new row is added to the board.
        </p>

        <div className="flex flex-col gap-4">
          {columns.map(col => {
            const currentValue = draft[col.id];
            const labels = labelsByColumn.get(col.id) ?? [];

            return (
              <div key={col.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-rf-text-primary">{col.name}</span>
                  {currentValue != null && (
                    <button
                      type="button"
                      onClick={() => clearValue(col.id)}
                      className="text-xs text-rf-text-muted hover:text-rf-danger transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Status column -- show label pills */}
                {col.type === "status" && (
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map(label => (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() =>
                          currentValue === label.id
                            ? clearValue(col.id)
                            : setValue(col.id, label.id)
                        }
                        className={`px-3 py-1.5 rounded text-sm font-medium text-white transition-all ${
                          currentValue === label.id
                            ? "ring-2 ring-offset-2 ring-rf-blue scale-105"
                            : "opacity-80 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: label.color }}
                      >
                        {label.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Text / email / phone */}
                {(col.type === "text" || col.type === "email" || col.type === "phone") && (
                  <input
                    type="text"
                    value={currentValue ?? ""}
                    onChange={e => e.target.value ? setValue(col.id, e.target.value) : clearValue(col.id)}
                    placeholder={`Default ${col.name.toLowerCase()}...`}
                    className="bg-rf-surface-card px-3 py-2 text-sm border border-rf-border rounded-lg outline-none focus:border-rf-blue transition-colors"
                  />
                )}

                {/* Number */}
                {col.type === "number" && (
                  <input
                    type="number"
                    value={currentValue ?? ""}
                    onChange={e => e.target.value !== "" ? setValue(col.id, Number(e.target.value)) : clearValue(col.id)}
                    placeholder="0"
                    className="bg-rf-surface-card px-3 py-2 text-sm border border-rf-border rounded-lg outline-none focus:border-rf-blue transition-colors w-40"
                  />
                )}

                {/* Date */}
                {col.type === "date" && (
                  <input
                    type="date"
                    value={currentValue ?? ""}
                    onChange={e => e.target.value ? setValue(col.id, e.target.value) : clearValue(col.id)}
                    className="bg-rf-surface-card px-3 py-2 text-sm border border-rf-border rounded-lg outline-none focus:border-rf-blue transition-colors w-48"
                  />
                )}

                {/* Checkbox */}
                {col.type === "checkbox" && (
                  <button
                    type="button"
                    onClick={() =>
                      currentValue == null
                        ? setValue(col.id, true)
                        : currentValue === true
                        ? setValue(col.id, false)
                        : clearValue(col.id)
                    }
                    className={`w-fit flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      currentValue === true
                        ? "border-rf-blue bg-rf-blue-tint text-rf-blue"
                        : currentValue === false
                        ? "border-rf-ink-300 bg-rf-ink-100 text-rf-text-muted"
                        : "border-rf-border text-rf-text-muted hover:border-rf-ink-300"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      currentValue === true ? "bg-rf-blue border-rf-blue" : "border-current"
                    }`}>
                      {currentValue === true && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    {currentValue === true ? "Checked" : currentValue === false ? "Unchecked" : "No default"}
                  </button>
                )}

                {/* FADV fields -- free text */}
                {(col.type === "fadv.package" || col.type === "fadv.location" || col.type === "fadv.facility_id" || col.type === "fadv.position_type") && (
                  <input
                    type="text"
                    value={currentValue ?? ""}
                    onChange={e => e.target.value ? setValue(col.id, e.target.value) : clearValue(col.id)}
                    placeholder={`Default ${col.name.toLowerCase()}...`}
                    className="bg-rf-surface-card px-3 py-2 text-sm border border-rf-border rounded-lg outline-none focus:border-rf-blue transition-colors"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-rf-text-muted hover:text-rf-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="px-6 py-2 bg-rf-blue text-white text-sm font-medium rounded-[10px] hover:bg-rf-blue-dark transition-colors shadow-sm disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
