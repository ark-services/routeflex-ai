"use client";

import { useEffect, useState, useRef } from "react";
import {
  Trash2,
  Copy,
  Send,
  GraduationCap,
  Link2,
  ExternalLink,
} from "lucide-react";
import { createPortal } from "react-dom";
import type { ApplicantRow, BoardColumn, StatusLabel, Group, CellColumnType } from "./types";
import { CellRenderer } from "./cell-renderer";

export function VirtualRow({
  applicant,
  columns,
  selected,
  onToggle,
  getCellValue,
  onUpdateCell,
  labelsByColumn,
  onEditLabels,
  rowMenuOpen,
  setRowMenuOpen,
  groups,
  onOpen,
  onMove,
  onDuplicate,
  onDelete,
  companyId,
  boardId,
  fadvReady = false,
  onSendToFadv,
  collapsedColumnIds = new Set(),
  frozenColumnsCount = 0,
  frozenLeftOffsets = [],
  gridTemplate,
  // DnD props for drag handle (when in drag-bypass mode)
  dragHandleProps,
}: {
  applicant: ApplicantRow;
  columns: BoardColumn[];
  selected: boolean;
  onToggle: () => void;
  getCellValue: (col: BoardColumn) => any;
  onUpdateCell: (colId: string, colType: CellColumnType, val: any) => void;
  labelsByColumn: Map<string, StatusLabel[]>;
  onEditLabels: (colId: string) => void;
  rowMenuOpen: boolean;
  setRowMenuOpen: (open: boolean) => void;
  groups: Group[];
  onOpen: () => void;
  onMove: (groupId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  companyId: string;
  boardId: string;
  fadvReady?: boolean;
  onSendToFadv?: () => Promise<void>;
  collapsedColumnIds?: Set<string>;
  frozenColumnsCount?: number;
  frozenLeftOffsets?: number[];
  gridTemplate: string;
  dragHandleProps?: Record<string, any>;
}) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  // Calculate menu position when it opens
  useEffect(() => {
    if (rowMenuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const MARGIN = 12;
      if (spaceBelow >= 240 || spaceBelow >= spaceAbove) {
        setMenuPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          maxHeight: spaceBelow - MARGIN,
        });
      } else {
        setMenuPosition({
          bottom: window.innerHeight - rect.top,
          left: rect.left + window.scrollX,
          maxHeight: spaceAbove - MARGIN,
        });
      }
    } else {
      setMenuPosition(null);
    }
  }, [rowMenuOpen]);

  return (
    <div
      className={`group border-b border-rf-ink-100 relative ${
        selected ? "bg-rf-blue-tint" : "bg-rf-surface-card hover:bg-rf-surface-page/60"
      }`}
      style={{ display: "grid", gridTemplateColumns: gridTemplate }}
    >
      {/* Sticky cell — checkbox + menu + drag handle */}
      <div
        className={`sticky left-0 z-10 px-4 py-2 ${
          selected
            ? "bg-rf-blue-tint"
            : "bg-rf-surface-card group-hover:bg-rf-surface-page"
        }`}
        style={{ boxShadow: "inset -1px 0 0 0 rgb(228, 232, 240)" }}
      >
        <div className="flex items-center gap-2">
          {fadvReady && (
            <span
              className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rf-blue-tint text-rf-blue border border-rf-blue-tint whitespace-nowrap"
              title="All FADV fields set — ready to submit"
            >
              ✓ FADV
            </span>
          )}
          <div className="relative">
            <button
              ref={menuButtonRef}
              onClick={() => setRowMenuOpen(!rowMenuOpen)}
              className="opacity-0 group-hover:opacity-100 text-rf-text-muted hover:text-rf-ink-700 transition text-sm"
              aria-label="Row options"
            >
              ⋮
            </button>
            {/* Render menu in a portal to escape overflow/z-index issues */}
            {rowMenuOpen &&
              menuPosition &&
              typeof window !== "undefined" &&
              createPortal(
                <>
                  <div
                    className="fixed inset-0 z-[998]"
                    onClick={() => setRowMenuOpen(false)}
                  />
                  <div
                    className="fixed z-[999] w-64 rounded-xl border border-rf-border bg-rf-surface-card shadow-2xl overflow-y-auto"
                    style={{
                      top:
                        menuPosition.top != null
                          ? `${menuPosition.top}px`
                          : undefined,
                      bottom:
                        menuPosition.bottom != null
                          ? `${menuPosition.bottom}px`
                          : undefined,
                      left: `${menuPosition.left}px`,
                      maxHeight: `${menuPosition.maxHeight}px`,
                    }}
                  >
                    <div className="px-4 py-3 border-b border-rf-ink-100 bg-rf-surface-page">
                      <p className="text-xs font-semibold text-rf-text-secondary uppercase tracking-wider truncate">
                        {applicant.full_name ?? "Applicant"}
                      </p>
                    </div>
                    <div className="py-2 border-b border-rf-ink-100">
                      <button
                        onClick={() => {
                          setRowMenuOpen(false);
                          onOpen();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                      >
                        <ExternalLink className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                        Open
                      </button>
                    </div>
                    <div className="py-2">
                      <p className="px-4 py-1.5 text-xs font-semibold text-rf-text-muted uppercase tracking-wider">
                        Move to
                      </p>
                      {groups.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => {
                            onMove(g.id);
                            setRowMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: g.color }}
                          />
                          {g.name}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-rf-ink-100" />
                    <div className="py-2">
                      <button
                        onClick={() => {
                          setRowMenuOpen(false);
                          onDuplicate();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                      >
                        <Copy className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                        Duplicate
                      </button>
                      {onSendToFadv && (
                        <button
                          onClick={() => {
                            setRowMenuOpen(false);
                            onSendToFadv();
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-blue hover:bg-rf-blue-tint transition-colors text-left"
                        >
                          <Send className="w-4 h-4 flex-shrink-0" />
                          Send to FADV
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setRowMenuOpen(false);
                          window.location.href = `/dashboard/${companyId}/applicants/${applicant.id}/training`;
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                      >
                        <GraduationCap className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                        Training Progress
                      </button>
                      {applicant.portal_token && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${window.location.origin}/status/${applicant.portal_token}`
                            );
                            setRowMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                        >
                          <Link2 className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                          Copy status link
                        </button>
                      )}
                    </div>
                    <div className="border-t border-rf-ink-100" />
                    <div className="py-2">
                      <button
                        onClick={() => {
                          setRowMenuOpen(false);
                          onDelete();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-danger hover:bg-rf-danger-bg transition-colors text-left"
                      >
                        <Trash2 className="w-4 h-4 flex-shrink-0" />
                        Delete
                      </button>
                    </div>
                  </div>
                </>,
                document.body
              )}
          </div>

          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 rounded border-rf-ink-100"
          />

          <button
            {...(dragHandleProps ?? {})}
            className="cursor-grab active:cursor-grabbing text-rf-text-muted hover:text-rf-ink-500 text-xs opacity-0 group-hover:opacity-100"
            aria-label="Drag to reorder row"
          >
            ⋮⋮
          </button>
        </div>
      </div>

      {/* Data cells */}
      {columns.map((col, colIdx) => {
        const isCollapsed = collapsedColumnIds.has(col.id);
        const isFrozen = colIdx < frozenColumnsCount;
        const isLastFrozen = isFrozen && colIdx === frozenColumnsCount - 1;
        const frozenLeft = isFrozen ? frozenLeftOffsets[colIdx] : undefined;
        return (
          <div
            key={col.id}
            className={`py-2 ${
              isFrozen ? "" : "border-r border-rf-ink-100"
            } last:border-r-0 ${
              isFrozen
                ? `sticky z-[9] ${
                    selected
                      ? "bg-rf-blue-tint"
                      : "bg-rf-surface-card group-hover:bg-rf-surface-page"
                  }`
                : "relative"
            } ${isCollapsed ? "px-1 w-12" : "px-4"}`}
            style={
              isFrozen
                ? {
                    left: frozenLeft,
                    boxShadow: isLastFrozen
                      ? "inset -2px 0 0 0 #c8cdd5"
                      : "inset -1px 0 0 0 rgb(228, 232, 240)",
                  }
                : undefined
            }
          >
            <CellRenderer
              applicant={applicant}
              column={col}
              value={getCellValue(col)}
              labels={labelsByColumn.get(col.id) ?? []}
              onUpdate={(val) =>
                onUpdateCell(col.id, col.type as CellColumnType, val)
              }
              onEditLabels={() => onEditLabels(col.id)}
              companyId={companyId}
              boardId={boardId}
              isCollapsed={isCollapsed}
            />
          </div>
        );
      })}

      {/* Empty cell for + column spacer */}
      <div className="px-4 py-2" />
    </div>
  );
}
