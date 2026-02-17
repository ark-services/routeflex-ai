"use client";

import { useRef, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { ActiveFilter, FilterCondition } from "./view-actions";
import type { BoardColumn, BoardStatusLabel } from "@/lib/types";

// ─── Condition options by column type ─────────────────────────────────────────

function conditionsForType(type: string): { value: FilterCondition; label: string }[] {
  switch (type) {
    case "number":
      return [
        { value: "equals", label: "equals" },
        { value: "greater_than", label: "greater than" },
        { value: "less_than", label: "less than" },
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "is not empty" },
      ];
    case "date":
      return [
        { value: "is", label: "is" },
        { value: "before", label: "before" },
        { value: "after", label: "after" },
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "is not empty" },
      ];
    case "status":
      return [
        { value: "is", label: "is" },
        { value: "is_not", label: "is not" },
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "is not empty" },
      ];
    case "file":
      return [
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "is not empty" },
      ];
    default: // text, email, phone, location
      return [
        { value: "contains", label: "contains" },
        { value: "equals", label: "is" },
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "is not empty" },
      ];
  }
}

// ─── Value input ──────────────────────────────────────────────────────────────

function ValueInput({
  column,
  condition,
  value,
  statusLabels,
  onChange,
}: {
  column: BoardColumn | null;
  condition: FilterCondition;
  value: string;
  statusLabels: BoardStatusLabel[];
  onChange: (v: string) => void;
}) {
  if (!column) return null;
  if (condition === "is_empty" || condition === "is_not_empty") return null;

  if (column.type === "status") {
    const labels = statusLabels.filter((sl) => sl.column_id === column.id);
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[120px]"
      >
        <option value="">Select…</option>
        {labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    );
  }

  if (column.type === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Value"
        className="h-8 w-28 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }

  if (column.type === "date") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
      className="h-8 min-w-[140px] rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

// ─── Save-as-view inline sub-form ─────────────────────────────────────────────

function SaveViewInline({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus when rendered
  setTimeout(() => inputRef.current?.focus(), 0);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="View name…"
        className="h-7 flex-1 min-w-0 rounded border border-stone-300 px-2 text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        onClick={submit}
        disabled={!name.trim()}
        className="h-7 px-2.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 shrink-0"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="h-7 px-2 text-xs text-stone-500 hover:text-stone-700 shrink-0"
      >
        Cancel
      </button>
    </div>
  );
}

// ─── Main FilterPanel component ───────────────────────────────────────────────

export interface FilterPanelProps {
  open: boolean;
  columns: BoardColumn[];
  statusLabels: BoardStatusLabel[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  onClose: () => void;
  onSaveView: (name: string) => void;
  isDirty: boolean;
}

export function FilterPanel({
  open,
  columns,
  statusLabels,
  filters,
  onFiltersChange,
  onClose,
  onSaveView,
  isDirty,
}: FilterPanelProps) {
  const [savingView, setSavingView] = useState(false);

  if (!open) return null;

  // ── Ensure at least one filter row is visible ─────────────────────────────

  // Seed the first filter row if none exist yet
  const displayFilters =
    filters.length === 0 && columns.length > 0
      ? (() => {
          const firstCol = columns[0];
          const conds = conditionsForType(firstCol.type);
          return [
            {
              id: "__seed__",
              columnId: firstCol.id,
              condition: conds[0]?.value ?? "contains",
              value: "",
            } as ActiveFilter,
          ];
        })()
      : filters;

  // Commit the seeded filter once the user touches it
  function ensureSeeded(id: string) {
    if (id === "__seed__" && filters.length === 0) {
      // Re-materialise the seeded row into real state
      onFiltersChange(displayFilters);
    }
  }

  // ── Filter operations ─────────────────────────────────────────────────────

  const updateFilter = (id: string, patch: Partial<ActiveFilter>) => {
    // If touching the seed row, write it as real first
    const base = filters.length === 0 ? displayFilters : filters;
    onFiltersChange(
      base.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...patch, id: f.id === "__seed__" ? Math.random().toString(36).slice(2) : f.id };
        if (patch.columnId && patch.columnId !== f.columnId) {
          const col = columns.find((c) => c.id === patch.columnId);
          const conds = col ? conditionsForType(col.type) : [];
          updated.condition = conds[0]?.value ?? "contains";
          updated.value = "";
        }
        return updated;
      })
    );
  };

  const removeFilter = (id: string) => {
    onFiltersChange(filters.filter((f) => f.id !== id));
  };

  const addFilter = () => {
    const firstCol = columns[0];
    if (!firstCol) return;
    const conditions = conditionsForType(firstCol.type);
    onFiltersChange([
      ...(filters.length === 0 ? [] : filters),
      {
        id: Math.random().toString(36).slice(2),
        columnId: firstCol.id,
        condition: conditions[0]?.value ?? "contains",
        value: "",
      },
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white border-b border-stone-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100">
        <span className="text-sm font-semibold text-stone-800">Filters</span>
        <div className="flex items-center gap-3">
          {filters.length > 0 && (
            <button
              onClick={() => onFiltersChange([])}
              className="text-xs text-stone-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-stone-100 transition-colors"
            title="Close filters"
          >
            <X className="h-3.5 w-3.5 text-stone-500" />
          </button>
        </div>
      </div>

      {/* Filter rows */}
      <div className="px-4 py-3 space-y-2">
        {displayFilters.map((f, idx) => {
          const col = columns.find((c) => c.id === f.columnId) ?? null;
          const conditions = col ? conditionsForType(col.type) : [];

          return (
            <div key={f.id} className="flex flex-wrap items-center gap-2">
              {/* Label */}
              <span className="text-xs text-stone-400 w-10 text-right shrink-0 font-medium">
                {idx === 0 ? "Where" : "And"}
              </span>

              {/* Column selector */}
              <select
                value={f.columnId}
                onChange={(e) => updateFilter(f.id, { columnId: e.target.value })}
                className="h-8 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Condition selector */}
              <select
                value={f.condition}
                onChange={(e) =>
                  updateFilter(f.id, { condition: e.target.value as FilterCondition })
                }
                className="h-8 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {conditions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>

              {/* Value input */}
              <ValueInput
                column={col}
                condition={f.condition}
                value={f.value}
                statusLabels={statusLabels}
                onChange={(v) => updateFilter(f.id, { value: v })}
              />

              {/* Remove */}
              <button
                onClick={() => removeFilter(f.id)}
                className="p-1 text-stone-300 hover:text-red-400 rounded transition-colors ml-auto"
                title="Remove filter"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-100 gap-4">
        <button
          onClick={addFilter}
          disabled={columns.length === 0}
          className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 font-medium disabled:opacity-40 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New filter
        </button>

        {/* Save as new view — secondary/white */}
        <div className="shrink-0">
          {savingView ? (
            <SaveViewInline
              onSave={(name) => {
                setSavingView(false);
                onSaveView(name);
              }}
              onCancel={() => setSavingView(false)}
            />
          ) : (
            <button
              onClick={() => setSavingView(true)}
              disabled={!isDirty}
              className="h-7 px-3 text-xs font-medium rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isDirty ? "Save current search & filters as a new view" : "No changes to save"}
            >
              Save as new view
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
