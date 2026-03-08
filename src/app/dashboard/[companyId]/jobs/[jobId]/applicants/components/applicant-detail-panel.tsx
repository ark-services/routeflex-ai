"use client";

import { X } from "lucide-react";
import type { BoardCell } from "@/lib/types";
import type { Group, BoardColumn, StatusLabel } from "./types";

export function ApplicantDetailPanel({
  applicant,
  group,
  columns,
  cells,
  labelsByColumn,
  onClose,
}: {
  applicant: { id: string; full_name: string; email: string; group_id: string | null };
  group: Group | undefined;
  columns: BoardColumn[];
  cells: BoardCell[];
  labelsByColumn: Map<string, StatusLabel[]>;
  onClose: () => void;
}) {
  const appCells = cells.filter((c) => c.applicant_id === applicant.id);

  return (
    <div className="fixed inset-0 z-[900] flex" role="dialog" aria-modal="true" aria-label={`Details for ${applicant.full_name}`}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="w-96 max-w-full bg-rf-surface-card shadow-2xl border-l border-rf-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-rf-ink-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-rf-text-primary truncate">{applicant.full_name || "Applicant"}</h2>
          <button
            onClick={onClose}
            aria-label="Close detail panel"
            className="p-1.5 rounded-lg hover:bg-rf-surface-page text-rf-text-muted hover:text-rf-ink-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stage */}
        {group && (
          <div className="px-5 py-2.5 border-b border-rf-ink-100 flex items-center gap-2 shrink-0">
            <span className="text-xs text-rf-text-muted font-medium">Stage</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: group.color }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
              {group.name}
            </span>
          </div>
        )}

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {columns.filter((col) => !col.is_hidden).map((col) => {
            const cell = appCells.find((c) => c.column_id === col.id);
            const labels = labelsByColumn.get(col.id) ?? [];

            if (col.type === "status") {
              const label = labels.find((l) => l.id === cell?.value_status_label_id);
              return (
                <div key={col.id}>
                  <p className="text-xs font-medium text-rf-text-muted mb-1">{col.name}</p>
                  {label ? (
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                      <span className="text-sm text-rf-ink-700">{label.label}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-rf-text-muted">—</span>
                  )}
                </div>
              );
            }

            let displayValue: string | null = null;
            if (col.type === "text" || col.type === "email" || col.type === "phone" || col.type === "location") {
              displayValue = cell?.value_text ?? null;
            } else if (col.type === "number") {
              displayValue = cell?.value_number != null ? String(cell.value_number) : null;
            } else if (col.type === "date") {
              displayValue = cell?.value_date ? new Date(cell.value_date).toLocaleDateString() : null;
            }

            return (
              <div key={col.id}>
                <p className="text-xs font-medium text-rf-text-muted mb-1">{col.name}</p>
                <p className="text-sm text-rf-ink-700 break-words">{displayValue ?? <span className="text-rf-text-muted">—</span>}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
