"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, ChevronDown, SlidersHorizontal } from "lucide-react";
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

const VALUE_LESS_CONDITIONS: FilterCondition[] = ["is_empty", "is_not_empty"];

export function isValidFilter(f: ActiveFilter): boolean {
  if (!f.columnId || !f.condition) return false;
  if ((VALUE_LESS_CONDITIONS as string[]).includes(f.condition)) return true;
  return f.value.trim() !== "";
}

// ─── Styled select wrapper ─────────────────────────────────────────────────────

function StyledSelect({
  value,
  onChange,
  children,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none h-8 pl-3 pr-8 rounded-lg border border-rf-ink-100 bg-rf-surface-card text-sm text-rf-ink-700 focus:outline-none focus:ring-2 focus:ring-rf-blue/20 focus:border-rf-blue cursor-pointer transition-colors hover:border-rf-ink-300 w-full"
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rf-ink-300 pointer-events-none shrink-0" />
    </div>
  );
}

// ─── And / Or toggle ──────────────────────────────────────────────────────────

function JoinerToggle({
  value,
  onChange,
}: {
  value: "and" | "or";
  onChange: (v: "and" | "or") => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-rf-ink-100 overflow-hidden h-8 shrink-0 text-xs font-semibold">
      <button
        type="button"
        onClick={() => onChange("and")}
        className={`px-3 h-full transition-colors ${
          value === "and"
            ? "bg-rf-blue text-white"
            : "bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page"
        }`}
      >
        And
      </button>
      <div className="w-px h-full bg-rf-ink-100" />
      <button
        type="button"
        onClick={() => onChange("or")}
        className={`px-3 h-full transition-colors ${
          value === "or"
            ? "bg-rf-blue text-white"
            : "bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page"
        }`}
      >
        Or
      </button>
    </div>
  );
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

  const inputCls =
    "h-8 rounded-lg border border-rf-ink-100 bg-rf-surface-card px-3 text-sm text-rf-ink-700 focus:outline-none focus:ring-2 focus:ring-rf-blue/20 focus:border-rf-blue transition-colors hover:border-rf-ink-300 placeholder-rf-ink-300";

  if (column.type === "status") {
    const labels = statusLabels.filter((sl) => sl.column_id === column.id);
    return (
      <StyledSelect value={value} onChange={onChange} className="min-w-[130px]">
        <option value="">Select…</option>
        {labels.map((l) => (
          <option key={l.id} value={l.id}>{l.label}</option>
        ))}
      </StyledSelect>
    );
  }
  if (column.type === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Value"
        className={`${inputCls} w-28`}
      />
    );
  }
  if (column.type === "date") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
      className={`${inputCls} min-w-[140px]`}
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
        className="h-7 w-36 rounded-lg border border-rf-ink-100 px-2.5 text-xs text-rf-ink-700 focus:outline-none focus:ring-2 focus:ring-rf-blue/20 focus:border-rf-blue"
      />
      <button
        onClick={submit}
        disabled={!name.trim()}
        className="h-7 px-3 text-xs font-semibold bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark disabled:opacity-40 transition-colors"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="h-7 px-2 text-xs text-rf-ink-500 hover:text-rf-ink-700 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ─── Portal-based popover panel ───────────────────────────────────────────────

export interface FilterPanelProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  columns: BoardColumn[];
  statusLabels: BoardStatusLabel[];
  /** Active (applied) filters — read-only here; used only to seed the draft on open. */
  filters: ActiveFilter[];
  /** Called only when the user explicitly applies or clears filters. */
  onFiltersChange: (filters: ActiveFilter[]) => void;
  onClose: () => void;
  /** Called when the user saves filters as a new named view; receives the validated filters. */
  onSaveView: (name: string, filters: ActiveFilter[]) => void;
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
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [savingView, setSavingView] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ── Draft state ────────────────────────────────────────────────────────────
  const [draftFilters, setDraftFilters] = useState<ActiveFilter[]>([]);

  // Client-only portal
  useEffect(() => { setMounted(true); }, []);

  // ── On open: seed draft ────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      const initial =
        filters.length > 0
          ? filters.map((f) => ({ ...f }))
          : columns.length > 0
          ? [makeBlankFilter(columns)]
          : [];
      setDraftFilters(initial);
    }
    if (!open) setSavingView(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Position the panel below the anchor button ────────────────────────────
  const updatePos = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.left });
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

  // ── Close on outside click / Escape ───────────────────────────────────────
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

  // ── Draft filter operations ────────────────────────────────────────────────

  const updateFilter = (id: string, patch: Partial<ActiveFilter>) => {
    setDraftFilters((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...patch };
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
    setDraftFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const addFilter = () => {
    if (columns.length === 0) return;
    setDraftFilters((prev) => [...prev, makeBlankFilter(columns, "and")]);
  };

  const handleApply = () => {
    onFiltersChange(draftFilters.filter(isValidFilter));
    onClose();
  };

  const handleClearAll = () => {
    setDraftFilters(columns.length > 0 ? [makeBlankFilter(columns)] : []);
    onFiltersChange([]);
  };

  const handleSaveView = (name: string) => {
    const valid = draftFilters.filter(isValidFilter);
    onFiltersChange(valid);
    onSaveView(name, valid);
    setSavingView(false);
    onClose();
  };

  const hasValidDraft = draftFilters.some(isValidFilter);
  const validCount = draftFilters.filter(isValidFilter).length;

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
        maxWidth: Math.min(720, window.innerWidth - 32),
        animation: "filterPanelIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
      className="bg-rf-surface-card rounded-2xl border border-rf-ink-100 shadow-2xl overflow-hidden"
    >
      <style>{`
        @keyframes filterPanelIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-rf-ink-100">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-rf-blue-tint">
            <SlidersHorizontal className="h-3.5 w-3.5 text-rf-blue" />
          </div>
          <span className="text-sm font-semibold text-rf-text-primary">Filters</span>
          {validCount > 0 && (
            <span className="inline-flex items-center justify-center h-4.5 min-w-[20px] px-1.5 text-[10px] font-bold bg-rf-blue text-white rounded-full leading-none py-0.5">
              {validCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {draftFilters.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs font-medium text-rf-ink-500 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center h-6 w-6 rounded-lg text-rf-ink-300 hover:text-rf-ink-700 hover:bg-rf-surface-page transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Filter rows ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 space-y-2">
        {draftFilters.length === 0 && (
          <p className="text-sm text-rf-ink-300 py-2 text-center">
            No filters yet. Add one below.
          </p>
        )}

        {draftFilters.map((f, idx) => {
          const col = columns.find((c) => c.id === f.columnId) ?? null;
          const conditions = col ? conditionsForType(col.type) : [];

          return (
            <div
              key={f.id}
              className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl bg-rf-surface-page border border-rf-ink-100 flex-wrap"
            >
              {/* Connector */}
              <div className="shrink-0 w-[52px] flex justify-end">
                {idx === 0 ? (
                  <span className="inline-flex items-center h-6 px-2 rounded-md bg-rf-ink-100 text-[11px] font-semibold text-rf-ink-500 tracking-wide uppercase select-none">
                    Where
                  </span>
                ) : (
                  <JoinerToggle
                    value={f.joiner ?? "and"}
                    onChange={(v) => updateFilter(f.id, { joiner: v })}
                  />
                )}
              </div>

              {/* Column selector */}
              <StyledSelect
                value={f.columnId}
                onChange={(v) => updateFilter(f.id, { columnId: v })}
                className="max-w-[200px] min-w-[120px] flex-1"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </StyledSelect>

              {/* Condition selector */}
              <StyledSelect
                value={f.condition}
                onChange={(v) => updateFilter(f.id, { condition: v as FilterCondition })}
                className="min-w-[110px]"
              >
                {conditions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </StyledSelect>

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
                className="ml-auto p-1.5 rounded-lg text-rf-ink-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                title="Remove filter"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-rf-ink-100 gap-4 bg-rf-surface-page/40">
        {/* + New filter */}
        <button
          onClick={addFilter}
          disabled={columns.length === 0}
          className="flex items-center gap-1.5 text-xs font-medium text-rf-ink-500 hover:text-rf-blue disabled:opacity-40 transition-colors shrink-0 group"
        >
          <span className="flex items-center justify-center h-5 w-5 rounded-md border border-rf-ink-100 bg-rf-surface-card group-hover:border-rf-blue group-hover:bg-rf-blue-tint transition-colors">
            <Plus className="h-3 w-3" />
          </span>
          Add filter
        </button>

        {/* Right-side actions */}
        <div className="flex items-center gap-2 shrink-0">
          {savingView ? (
            <SaveViewInline
              onSave={handleSaveView}
              onCancel={() => setSavingView(false)}
            />
          ) : (
            <button
              onClick={() => setSavingView(true)}
              disabled={!hasValidDraft}
              className="h-8 px-3 text-xs font-medium rounded-lg border border-rf-ink-100 bg-rf-surface-card text-rf-ink-700 hover:bg-rf-surface-page hover:border-rf-ink-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={hasValidDraft ? "Save current filters as a new view" : "Add a complete filter first"}
            >
              Save as new view
            </button>
          )}

          <button
            onClick={handleApply}
            className="h-8 px-4 text-xs font-semibold rounded-lg bg-rf-blue text-white hover:bg-rf-blue-dark transition-colors shadow-sm"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
