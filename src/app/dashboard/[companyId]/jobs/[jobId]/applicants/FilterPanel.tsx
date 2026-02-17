"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2 } from "lucide-react";
import type { ActiveFilter, FilterCondition } from "./view-actions";
import type { BoardColumn, BoardStatusLabel } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newFilterId() {
  return Math.random().toString(36).slice(2, 10);
}

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
    default:
      return [
        { value: "contains", label: "contains" },
        { value: "equals", label: "is" },
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "is not empty" },
      ];
  }
}

function makeBlankFilter(columns: BoardColumn[], joiner?: "and" | "or"): ActiveFilter {
  const col = columns[0];
  const conds = col ? conditionsForType(col.type) : [];
  return {
    id: newFilterId(),
    columnId: col?.id ?? "",
    condition: conds[0]?.value ?? "contains",
    value: "",
    joiner,
  };
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

  const cls =
    "h-8 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500";

  if (column.type === "status") {
    const labels = statusLabels.filter((sl) => sl.column_id === column.id);
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${cls} min-w-[120px]`}>
        <option value="">Select…</option>
        {labels.map((l) => (
          <option key={l.id} value={l.id}>{l.label}</option>
        ))}
      </select>
    );
  }
  if (column.type === "number") {
    return (
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="Value" className={`${cls} w-28`} />
    );
  }
  if (column.type === "date") {
    return (
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
    );
  }
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder="Value" className={`${cls} min-w-[140px]`} />
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
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const submit = () => { const t = name.trim(); if (t) onSave(t); };

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={ref}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
        placeholder="View name…"
        className="h-7 w-36 rounded border border-stone-300 px-2 text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button onClick={submit} disabled={!name.trim()}
        className="h-7 px-2.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
        Save
      </button>
      <button onClick={onCancel} className="h-7 px-2 text-xs text-stone-500 hover:text-stone-700">
        Cancel
      </button>
    </div>
  );
}

// ─── Portal-based popover panel ───────────────────────────────────────────────

export interface FilterPanelProps {
  open: boolean;
  anchorEl: HTMLElement | null;  // the Filter button element for positioning
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
  anchorEl,
  columns,
  statusLabels,
  filters,
  onFiltersChange,
  onClose,
  onSaveView,
  isDirty,
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [savingView, setSavingView] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Client-only portal
  useEffect(() => { setMounted(true); }, []);

  // ── Auto-seed: when panel opens with no filters, add first row immediately ──
  useEffect(() => {
    if (open && filters.length === 0 && columns.length > 0) {
      onFiltersChange([makeBlankFilter(columns)]);
    }
    if (!open) setSavingView(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Position the panel below the anchor button ────────────────────────────
  const updatePos = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
  }, [anchorEl]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, updatePos]);

  // ── Close on outside click / Escape ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose, anchorEl]);

  // ── Filter operations ─────────────────────────────────────────────────────

  const updateFilter = (id: string, patch: Partial<ActiveFilter>) => {
    onFiltersChange(
      filters.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...patch };
        // Reset condition + value when column changes
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
    if (columns.length === 0) return;
    // Always creates one new row immediately — no double-click needed
    onFiltersChange([...filters, makeBlankFilter(columns, "and")]);
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (!mounted || !open) return null;

  const panel = (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        minWidth: 520,
        maxWidth: "calc(100vw - 32px)",
      }}
      className="bg-white rounded-xl border border-stone-200 shadow-xl"
    >
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
            title="Close"
          >
            <X className="h-3.5 w-3.5 text-stone-500" />
          </button>
        </div>
      </div>

      {/* Filter rows */}
      <div className="px-4 py-3 space-y-2">
        {filters.map((f, idx) => {
          const col = columns.find((c) => c.id === f.columnId) ?? null;
          const conditions = col ? conditionsForType(col.type) : [];

          return (
            <div key={f.id} className="flex items-center gap-2 flex-wrap">
              {/* Connector — "Where" for row 0, And/Or dropdown for rows 1+ */}
              {idx === 0 ? (
                <span className="text-xs font-medium text-stone-400 w-12 text-right shrink-0 select-none">
                  Where
                </span>
              ) : (
                <select
                  value={f.joiner ?? "and"}
                  onChange={(e) =>
                    updateFilter(f.id, { joiner: e.target.value as "and" | "or" })
                  }
                  className="h-8 w-16 rounded-md border border-stone-200 bg-white px-1.5 text-xs text-stone-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
                >
                  <option value="and">And</option>
                  <option value="or">Or</option>
                </select>
              )}

              {/* Column selector */}
              <select
                value={f.columnId}
                onChange={(e) => updateFilter(f.id, { columnId: e.target.value })}
                className="h-8 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
                  <option key={c.value} value={c.value}>{c.label}</option>
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

              {/* Trash — immediately after the value control, not pushed far right */}
              <button
                onClick={() => removeFilter(f.id)}
                className="p-1.5 text-stone-300 hover:text-red-400 rounded transition-colors shrink-0"
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
        {/* + New filter */}
        <button
          onClick={addFilter}
          disabled={columns.length === 0}
          className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 font-medium disabled:opacity-40 transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          New filter
        </button>

        {/* Save as new view — secondary/white, inside panel */}
        <div className="shrink-0">
          {savingView ? (
            <SaveViewInline
              onSave={(name) => { setSavingView(false); onSaveView(name); }}
              onCancel={() => setSavingView(false)}
            />
          ) : (
            <button
              onClick={() => setSavingView(true)}
              disabled={!isDirty}
              className="h-7 px-3 text-xs font-medium rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isDirty ? "Save current filters as a new view" : "No changes to save"}
            >
              Save as new view
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
