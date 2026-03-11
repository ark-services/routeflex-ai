"use client";

import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ApplicantRow, BoardColumn, StatusLabel } from "./types";
import { SortableColumnHeader } from "./sortable-column-header";

interface VirtualColumnHeadersProps {
  columns: BoardColumn[];
  rows: ApplicantRow[];
  selected: Record<string, boolean>;
  toggleAllInGroup: (groupId: string, rows: ApplicantRow[]) => void;
  groupId: string;
  gridTemplate: string;
  // Column callbacks
  onColumnWidthChange: (colId: string, w: number) => void;
  onColumnWidthCommit: (colId: string, w: number) => void;
  onColumnWidthReset: (colId: string, colType: string) => void;
  onSaveColumnName: (colId: string, name: string) => void;
  onDeleteColumn: (colId: string) => void;
  onToggleMinimizeColumn: (colId: string, groupId: string) => void;
  onAddColumnRight: (colId: string) => void;
  onShowAddColumnModal: () => void;
  collapsedColIds: Set<string>;
  frozenColumnsCount: number;
  frozenLeftOffsets: number[];
  sortState: { columnId: string; direction: "asc" | "desc" } | null;
  onSort: (colId: string) => void;
  getColumnWidth: (colId: string, colType: string) => number;
}

export function VirtualColumnHeaders({
  columns,
  rows,
  selected,
  toggleAllInGroup,
  groupId,
  gridTemplate,
  onColumnWidthChange,
  onColumnWidthCommit,
  onColumnWidthReset,
  onSaveColumnName,
  onDeleteColumn,
  onToggleMinimizeColumn,
  onAddColumnRight,
  onShowAddColumnModal,
  collapsedColIds,
  frozenColumnsCount,
  frozenLeftOffsets,
  sortState,
  onSort,
  getColumnWidth,
}: VirtualColumnHeadersProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);
  const someSelected =
    !allSelected && rows.length > 0 && rows.some((r) => selected[r.id]);

  return (
    <div
      className="bg-rf-surface-card border-b border-rf-border"
      style={{ display: "grid", gridTemplateColumns: gridTemplate }}
    >
      {/* Sticky checkbox cell */}
      <div
        className="sticky left-0 z-20 flex items-center bg-rf-surface-card px-4 py-2"
        style={{ boxShadow: "inset -1px 0 0 0 rgb(228, 232, 240)" }}
      >
        <div className="flex items-center gap-2">
          {/* invisible spacer matching the hidden ⋮ row-menu button */}
          <div className="opacity-0 text-sm select-none">⋮</div>
          {rows.length > 0 && (
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={() => toggleAllInGroup(groupId, rows)}
              className="h-4 w-4 rounded border-rf-ink-100 cursor-pointer accent-green-600"
            />
          )}
        </div>
      </div>

      {/* Sortable columns */}
      <SortableContext
        items={columns.map((c) => `col-${c.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        {columns.map((col, colIdx) => (
          <SortableColumnHeader
            key={col.id}
            column={col}
            width={getColumnWidth(col.id, col.type)}
            onWidthChange={(w) => onColumnWidthChange(col.id, w)}
            onWidthCommit={(w) => onColumnWidthCommit(col.id, w)}
            onWidthReset={() => onColumnWidthReset(col.id, col.type)}
            onSaveEdit={(newName) => onSaveColumnName(col.id, newName)}
            onDelete={() => onDeleteColumn(col.id)}
            onToggleMinimize={() => onToggleMinimizeColumn(col.id, groupId)}
            onAddRight={() => onAddColumnRight(col.id)}
            isCollapsed={collapsedColIds.has(col.id)}
            isFrozen={colIdx < frozenColumnsCount}
            frozenLeft={frozenLeftOffsets[colIdx]}
            isLastFrozen={colIdx === frozenColumnsCount - 1}
            sortDirection={
              sortState?.columnId === col.id ? sortState.direction : null
            }
            onSort={() => onSort(col.id)}
          />
        ))}
      </SortableContext>

      {/* Add column button */}
      <div className="flex items-center px-4 py-2">
        <button
          onClick={onShowAddColumnModal}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-rf-ink-100 bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page hover:text-rf-text-primary transition"
          title="Add column"
        >
          +
        </button>
      </div>
    </div>
  );
}
