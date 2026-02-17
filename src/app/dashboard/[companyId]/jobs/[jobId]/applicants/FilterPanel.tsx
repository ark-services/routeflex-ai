"use client";

import { useEffect, useRef } from "react";
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
        { value: "equals", label: "equals" },
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "is not empty" },
      ];
  }
}

// ─── Value input per column type ──────────────────────────────────────────────

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
        className="h-8 rounded border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[120px]"
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
        className="h-8 w-28 rounded border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  if (column.type === "date") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
      className="h-8 min-w-[120px] rounded border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface FilterPanelProps {
  open: boolean;
  columns: BoardColumn[];
  statusLabels: BoardStatusLabel[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FilterPanel({
  open,
  columns,
  statusLabels,
  filters,
  onFiltersChange,
  onClose,
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const addFilter = () => {
    const firstCol = columns[0];
    if (!firstCol) return;
    const conditions = conditionsForType(firstCol.type);
    onFiltersChange([
      ...filters,
      {
        id: Math.random().toString(36).slice(2),
        columnId: firstCol.id,
        condition: conditions[0]?.value ?? "contains",
        value: "",
      },
    ]);
  };

  const updateFilter = (id: string, patch: Partial<ActiveFilter>) => {
    onFiltersChange(
      filters.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...patch };
        // Reset condition when column changes
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-sm font-semibold text-stone-900">
            Advanced filters
          </h2>
          <div className="flex items-center gap-3">
            {filters.length > 0 && (
              <button
                onClick={() => onFiltersChange([])}
                className="text-xs text-stone-500 hover:text-red-600 transition-colors"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-stone-100 rounded transition-colors"
            >
              <X className="h-4 w-4 text-stone-500" />
            </button>
          </div>
        </div>

        {/* Filter rows */}
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {filters.length === 0 && (
            <p className="text-sm text-stone-400 text-center py-4">
              No filters yet. Add one below.
            </p>
          )}

          {filters.map((f, idx) => {
            const col = columns.find((c) => c.id === f.columnId) ?? null;
            const conditions = col ? conditionsForType(col.type) : [];

            return (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-2 py-1"
              >
                {/* Index label */}
                <span className="text-xs text-stone-400 w-8 text-right shrink-0">
                  {idx === 0 ? "Where" : "And"}
                </span>

                {/* Column selector */}
                <select
                  value={f.columnId}
                  onChange={(e) =>
                    updateFilter(f.id, { columnId: e.target.value })
                  }
                  className="h-8 rounded border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    updateFilter(f.id, {
                      condition: e.target.value as FilterCondition,
                    })
                  }
                  className="h-8 rounded border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

                {/* Remove button */}
                <button
                  onClick={() => removeFilter(f.id)}
                  className="ml-auto p-1 text-stone-400 hover:text-red-500 rounded transition-colors"
                  title="Remove filter"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center px-5 py-3 border-t border-stone-100">
          <button
            onClick={addFilter}
            disabled={columns.length === 0}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            New filter
          </button>
        </div>
      </div>
    </div>
  );
}
