"use client";

import { useEffect, useState, useTransition } from "react";
import { Maximize2, X as XIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { StatusDropdown } from "@/components/ui/status-dropdown";
import type { ApplicantRow, BoardColumn, StatusLabel } from "./types";
import { EmailCell } from "./email-cell";
import { PhoneCell } from "./phone-cell";
import { FileCell } from "./file-cell";

const VERBOSE = false;

export function CellRenderer({
  applicant,
  column,
  value,
  labels,
  onUpdate,
  onEditLabels,
  companyId,
  boardId,
  isCollapsed: isCollapsedProp,
}: {
  applicant: ApplicantRow;
  column: BoardColumn;
  value: any;
  labels: StatusLabel[];
  onUpdate: (val: any) => void;
  onEditLabels: () => void;
  companyId?: string;
  boardId?: string;
  isCollapsed?: boolean;
}) {
  // All hooks must be declared unconditionally before any early returns
  const [isPending, startTransition] = useTransition();
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const [showExpanded, setShowExpanded] = useState(false);

  // Update local value when prop changes (from server)
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value);
    }
  }, [value, isEditing]);

  // Per-group collapsed state takes priority; fall back to legacy column-level setting
  const isCollapsed = isCollapsedProp ?? column.settings?.ui?.collapsed ?? false;
  if (isCollapsed) {
    return <span className="text-xs text-rf-text-muted">—</span>;
  }

  // Commit the edit to server
  const commitEdit = () => {
    if (localValue !== value) {
      if (VERBOSE) console.log('[CellRenderer] Committing edit:', {
        applicantId: applicant.id,
        columnId: column.id,
        columnName: column.name,
        oldValue: value,
        newValue: localValue,
      });
      startTransition(() => onUpdate(localValue));
    }
    setIsEditing(false);
  };

  // Cancel edit and revert to original value
  const cancelEdit = () => {
    setLocalValue(value);
    setIsEditing(false);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
      (e.target as HTMLInputElement).blur();
    }
  };

  if (column.is_system) {
    if (column.type === "text") {
      return <span className="text-sm text-rf-ink-700 truncate" title={value || undefined}>{value || "—"}</span>;
    }
    if (column.type === "status") {
      const selectedLabel = labels.find((l) => l.label.toLowerCase() === value?.toLowerCase());
      return (
        <div className="flex items-center gap-2">
          {selectedLabel && (
            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: selectedLabel.color }} />
          )}
          <span className="text-sm text-rf-ink-700 truncate" title={value || undefined}>{value || "—"}</span>
        </div>
      );
    }
    return <span className="text-sm text-rf-ink-700 truncate" title={value || undefined}>{value || "—"}</span>;
  }

  if (column.type === "text") {
    const isLong = (localValue?.length ?? 0) > 100;
    return (
      <div className="relative group/textcell">
        <input
          type="text"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-border focus:border-rf-blue"
          placeholder="—"
          title={!isLong ? (localValue || undefined) : undefined}
        />
        {/* Expand button -- shown on hover for long text values */}
        {isLong && !isPending && (
          <button
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowExpanded(true); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/textcell:opacity-100 transition-opacity p-0.5 rounded text-rf-text-muted hover:text-rf-blue hover:bg-rf-blue-tint"
            title="View full text"
            tabIndex={-1}
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        )}
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
        {/* Full-text modal for long values */}
        {showExpanded && isLong && typeof window !== 'undefined' && createPortal(
          <>
            <div className="fixed inset-0 z-[998] bg-black/30" onClick={() => setShowExpanded(false)} />
            <div className="fixed z-[999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-h-[70vh] rounded-xl border border-rf-border bg-rf-surface-card shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-rf-ink-100 shrink-0">
                <p className="text-sm font-semibold text-rf-text-primary">{column.name}</p>
                <button
                  onClick={() => setShowExpanded(false)}
                  className="text-rf-text-muted hover:text-rf-text-primary transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <p className="text-sm text-rf-ink-700 whitespace-pre-wrap leading-relaxed">{localValue}</p>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  }

  if (column.type === "number") {
    return (
      <div className="relative">
        <input
          type="number"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value ? parseFloat(e.target.value) : null)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-border focus:border-rf-blue"
          placeholder="—"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  if (column.type === "date") {
    return (
      <div className="relative">
        <input
          type="date"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-border focus:border-rf-blue"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  if (column.type === "status") {
    return (
      <StatusDropdown
        value={value}
        labels={labels}
        onChange={(val) => startTransition(() => onUpdate(val))}
        onEditLabels={onEditLabels}
      />
    );
  }

  if (column.type === "email") {
    return <EmailCell value={value} onUpdate={onUpdate} />;
  }

  if (column.type === "phone") {
    return <PhoneCell value={value} onUpdate={onUpdate} />;
  }

  if (column.type === "location") {
    return (
      <div className="relative">
        <input
          type="text"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-border focus:border-rf-blue"
          placeholder="City, State"
          title={localValue || undefined}
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  if (
    column.type === "fadv.package" ||
    column.type === "fadv.location" ||
    column.type === "fadv.facility_id" ||
    column.type === "fadv.position_type"
  ) {
    const placeholders: Record<string, string> = {
      "fadv.package":       "e.g. STANDARD",
      "fadv.location":      "e.g. Chicago",
      "fadv.facility_id":   "e.g. FAC001",
      "fadv.position_type": "e.g. Driver",
    };
    return (
      <div className="relative">
        <input
          type="text"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-blue-tint focus:border-rf-blue bg-rf-blue-tint/30"
          placeholder={placeholders[column.type] ?? "—"}
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  // CHECKBOX TYPE -- boolean toggle (like Monday's checkbox column)
  if (column.type === "checkbox") {
    const checked = Boolean(value);
    return (
      <button
        type="button"
        onClick={() => startTransition(() => onUpdate(!checked))}
        className="flex h-8 w-full items-center justify-center"
        aria-label={checked ? "Uncheck" : "Check"}
      >
        <div
          className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
            checked
              ? "bg-rf-success"
              : "border-2 border-rf-ink-100 hover:border-rf-ink-300 bg-rf-surface-card"
          }`}
        >
          {checked && (
            <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,6 5,9 10,3" />
            </svg>
          )}
        </div>
        {isPending && (
          <div className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-green-500" />
        )}
      </button>
    );
  }

  if (column.type === "file") {
    return (
      <FileCell
        applicant={applicant}
        column={column}
        value={value}
        companyId={companyId ?? ""}
        boardId={boardId ?? ""}
        onUpdate={onUpdate}
      />
    );
  }

  return <span className="text-rf-text-muted">—</span>;
}
