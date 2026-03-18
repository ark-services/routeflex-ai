"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, ChevronDown, Search } from "lucide-react";
import type { Column, Group, VariableGroup } from "./automations-types";
export { slugifyColName } from "./automations-types";

// ============================================================================
// ColumnPicker
// ============================================================================

export function ColumnPicker({
  columns,
  selectedId,
  onSelect,
  placeholder,
  extraOptions,
}: {
  columns: Column[];
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholder: string;
  extraOptions?: Array<{ id: string; name: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected =
    columns.find((c) => c.id === selectedId) ??
    extraOptions?.find((o) => o.id === selectedId);

  const q = search.toLowerCase();
  const filteredColumns = q
    ? columns.filter((c) => c.name.toLowerCase().includes(q))
    : columns;
  const filteredExtra = q
    ? (extraOptions ?? []).filter((o) => o.name.toLowerCase().includes(q))
    : (extraOptions ?? []);

  function close() {
    setIsOpen(false);
    setSearch("");
  }

  useEffect(() => {
    if (isOpen) {
      // Tiny delay so the input is mounted before focusing
      setTimeout(() => searchRef.current?.focus(), 10);
    }
  }, [isOpen]);

  return (
    <div className="relative inline-block">
      {/* Backdrop */}
      {isOpen && <div className="fixed inset-0 z-10" onClick={close} />}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1 border border-rf-blue-tint bg-rf-blue-tint/70 rounded-md text-rf-blue font-medium text-[15px] hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-1"
      >
        {selected ? selected.name : placeholder}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg min-w-[200px]">
          {/* Search input */}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-rf-border">
            <Search className="w-3.5 h-3.5 text-rf-text-muted flex-shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                if (e.key === "Enter" && filteredColumns.length === 1) {
                  onSelect(filteredColumns[0].id);
                  close();
                }
              }}
              placeholder="Search columns…"
              className="w-full text-sm outline-none bg-transparent text-rf-ink-900 placeholder-rf-text-muted"
            />
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filteredColumns.map((col) => (
              <button
                key={col.id}
                onClick={() => { onSelect(col.id); close(); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-rf-border last:border-b-0"
              >
                {col.name}
              </button>
            ))}
            {filteredExtra.map((opt) => (
              <button
                key={opt.id}
                onClick={() => { onSelect(opt.id); close(); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-rf-border last:border-b-0 text-rf-text-muted italic"
              >
                {opt.name}
              </button>
            ))}
            {filteredColumns.length === 0 && filteredExtra.length === 0 && (
              <div className="px-3 py-2 text-rf-text-muted text-xs">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LabelPicker
// ============================================================================

export function LabelPicker({
  labels,
  selectedId,
  onSelect,
  placeholder,
}: {
  labels: Array<{ id: string; label: string; color: string }>;
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = labels.find((l) => l.id === selectedId);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1 border border-rf-blue-tint bg-rf-blue-tint/70 rounded-md text-rf-blue font-medium text-[15px] hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-1.5"
      >
        {selected ? (
          <>
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: selected.color || "#94a3b8" }}
            />
            {selected.label}
          </>
        ) : placeholder}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg min-w-[160px] max-h-52 overflow-y-auto">
          {labels.map((lbl) => (
            <button
              key={lbl.id}
              onClick={() => { onSelect(lbl.id); setIsOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-rf-border last:border-b-0 flex items-center gap-1.5"
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: lbl.color || "#94a3b8" }}
              />
              {lbl.label}
            </button>
          ))}
          {labels.length === 0 && (
            <div className="px-3 py-1.5 text-rf-text-muted text-xs">No labels available</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CoursePicker
// ============================================================================

export function CoursePicker({
  courses,
  selectedId,
  onSelect,
}: {
  courses: { id: string; name: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = courses.find((c) => c.id === selectedId);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1 border border-rf-blue-tint bg-rf-blue-tint/70 rounded-md text-rf-blue font-medium text-[15px] hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-1"
      >
        {selected ? selected.name : "choose course"}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg min-w-[220px] max-h-52 overflow-y-auto">
          {courses.map((course) => (
            <button
              key={course.id}
              onClick={() => {
                onSelect(course.id);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-rf-border last:border-b-0"
            >
              {course.name}
            </button>
          ))}
          {courses.length === 0 && (
            <div className="px-3 py-1.5 text-rf-text-muted text-xs">
              No published courses — create and publish a course in Training first
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VariablePickerButton
// ============================================================================

/**
 * A "+ Add variable" button that inserts the chosen token at the current cursor
 * position of the associated input/textarea (via `fieldRef`).
 */
export function VariablePickerButton({
  groups,
  fieldRef,
  value,
  onChange,
}: {
  groups: VariableGroup[];
  fieldRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleInsert(token: string) {
    const el = fieldRef.current;
    const start = el?.selectionStart ?? value.length;
    const end   = el?.selectionEnd   ?? value.length;
    const newValue = value.slice(0, start) + token + value.slice(end);
    onChange(newValue);
    // Restore cursor after React re-renders the controlled input
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      }
    });
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        <Plus className="w-3 h-3" />
        Add variable
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-60 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.section}>
              <div className="px-3 py-1 text-xs font-semibold text-rf-text-muted uppercase tracking-wide bg-rf-surface-page sticky top-0">
                {group.section}
              </div>
              {group.items.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => handleInsert(v.token)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-rf-surface-page flex items-center justify-between gap-2"
                >
                  <span className="text-rf-ink-700 truncate">{v.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// StatusLabelPicker
// ============================================================================

export function StatusLabelPicker({
  column,
  selectedId,
  onSelect,
  placeholder,
}: {
  column?: Column;
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const labels = column?.labels || [];
  const selected = labels.find((l) => l.id === selectedId);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1 border border-rf-blue-tint bg-rf-blue-tint/70 rounded-md text-rf-blue font-medium text-[15px] hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-1"
      >
        {selected ? selected.label : placeholder}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg min-w-[140px] max-h-52 overflow-y-auto">
          {labels.map((label) => (
            <button
              key={label.id}
              onClick={() => {
                onSelect(label.id);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-rf-border last:border-b-0 flex items-center gap-1.5"
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.label}
            </button>
          ))}
          {labels.length === 0 && (
            <div className="px-3 py-1.5 text-rf-text-muted text-xs">No labels available</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GroupPicker
// ============================================================================

export function GroupPicker({
  groups,
  selectedId,
  onSelect,
  placeholder,
  allowAny = false,
}: {
  groups: Group[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  placeholder: string;
  allowAny?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = groups.find((g) => g.id === selectedId);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1 border border-rf-blue-tint bg-rf-blue-tint/70 rounded-md text-rf-blue font-medium text-[15px] hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-1"
      >
        {selected ? selected.name : selectedId === undefined && allowAny ? "any group" : placeholder}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg min-w-[140px] max-h-52 overflow-y-auto">
          {allowAny && (
            <button
              onClick={() => {
                onSelect(undefined);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-rf-border"
            >
              <span className="text-rf-text-muted italic">Any group</span>
            </button>
          )}
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => {
                onSelect(group.id);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-rf-border last:border-b-0 flex items-center gap-1.5"
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              {group.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
