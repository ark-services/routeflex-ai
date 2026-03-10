"use client";

import { useEffect, useState, useRef } from "react";
import {
  PencilLine,
  Trash2,
  ChevronsLeftRight,
  Plus,
  RotateCcw,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { createPortal } from "react-dom";
import type React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardColumn } from "./types";
import { COLUMN_MIN_WIDTH, COLUMN_MAX_WIDTH } from "./types";

export function SortableColumnHeader({
  column,
  width,
  onWidthChange,
  onWidthCommit,
  onWidthReset,
  onDelete,
  onToggleMinimize,
  onAddRight,
  onSaveEdit,
  isCollapsed: isCollapsedProp,
  isFrozen = false,
  frozenLeft,
  isLastFrozen = false,
  sortDirection = null,
  onSort,
}: {
  column: BoardColumn;
  width: number;
  onWidthChange: (w: number) => void;
  onWidthCommit: (w: number) => void;
  onWidthReset: () => void;
  onDelete: () => void;
  onToggleMinimize: () => void;
  onAddRight: () => void;
  onSaveEdit: (newName: string) => void;
  isCollapsed?: boolean;
  isFrozen?: boolean;
  frozenLeft?: number;
  isLastFrozen?: boolean;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
}) {
  // Local edit state - matches CellRenderer pattern exactly
  const [localValue, setLocalValue] = useState(column.name);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCollapsed = isCollapsedProp ?? column.settings?.ui?.collapsed ?? false;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-${column.id}`,
    // Disable when editing, collapsed, system columns, or frozen (sticky + transform don't mix)
    disabled: isEditing || isCollapsed || column.is_system || isFrozen,
  });

  // Use `undefined` (not "") so browsers don't apply a no-op transform that breaks position:sticky
  const dndTransform = CSS.Transform.toString(transform);
  const style = {
    transform: dndTransform || undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const isResizing = useRef(false);

  // Update local value when column name changes from server
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(column.name);
    }
  }, [column.name, isEditing]);

  // Commit the edit to server (same pattern as CellRenderer)
  const commitEdit = () => {
    const trimmed = localValue.trim();
    if (trimmed && trimmed !== column.name) {
      onSaveEdit(trimmed);
    } else {
      setLocalValue(column.name); // Revert if empty or unchanged
    }
    setIsEditing(false);
  };

  // Cancel edit and revert to original value
  const cancelEdit = () => {
    setLocalValue(column.name);
    setIsEditing(false);
  };

  // Handle keyboard shortcuts (same as CellRenderer)
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

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    }
  }, [isEditing]);

  // Calculate menu position when it opens -- flip upward if not enough space below
  useEffect(() => {
    if (menuOpen && menuButtonRef.current) {
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
  }, [menuOpen]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        position: isFrozen ? 'sticky' : 'relative',
        left: isFrozen ? frozenLeft : undefined,
        zIndex: isFrozen ? 19 : undefined,
        boxShadow: isLastFrozen ? 'inset -2px 0 0 0 #c8cdd5' : (isFrozen ? 'inset -1px 0 0 0 rgb(228, 232, 240)' : undefined),
      }}
      className={`group py-2 text-sm font-medium text-rf-ink-700 ${isFrozen ? "" : "border-r border-rf-border"} last:border-r-0 ${
        isFrozen ? "bg-rf-surface-card" : ""
      } ${isCollapsed ? "px-0 w-8" : "px-3"
      }${!isEditing && !isCollapsed && !column.is_system && !isFrozen ? " cursor-grab active:cursor-grabbing" : ""}`}
      {...attributes}
      {...listeners}
    >
      {isCollapsed ? (
        <div className="relative flex items-center justify-center group/collapsed">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMinimize();
            }}
            className="text-rf-text-muted hover:text-rf-ink-700 cursor-pointer text-xs leading-none"
          >
            ↔
          </button>
          {/* Instant tooltip -- drops below header so it's never clipped by thead overflow */}
          <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-rf-ink-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/collapsed:opacity-100 z-[200]">
            Expand &ldquo;{column.name}&rdquo;
          </div>
        </div>
      ) : (
        <>
          {/* Sort badge -- floats at top-center, Monday-style */}
          {column.type !== "file" && onSort && !isCollapsed && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSort(); }}
              className={`absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full border shadow-sm transition-all ${
                sortDirection != null
                  ? "opacity-100 bg-rf-ink-700 border-rf-ink-700 text-white"
                  : "opacity-0 group-hover:opacity-100 bg-rf-surface-card border-rf-border text-rf-text-muted hover:border-rf-ink-300"
              }`}
              title={sortDirection === "asc" ? "Sorted A->Z - click for Z->A" : sortDirection === "desc" ? "Sorted Z->A - click to clear" : "Sort"}
            >
              <span className="flex flex-col items-center leading-none gap-px">
                <ChevronUp className={`h-2.5 w-2.5 ${sortDirection === "desc" ? "opacity-30" : ""}`} />
                <ChevronDown className={`h-2.5 w-2.5 ${sortDirection === "asc" ? "opacity-30" : ""}`} />
              </span>
            </button>
          )}
        <div className="flex items-center w-full min-w-0">
          {isEditing ? (
            // DRAG EXCLUSION: editing input -- onPointerDown/onMouseDown stop events reaching <th> drag listeners
            <input
              ref={inputRef}
              type="text"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              // Width tracks typed content so the input doesn't occupy more space than needed
              style={{ width: `${Math.max(4, localValue.length + 2)}ch` }}
              className="h-7 min-w-[3ch] max-w-full rounded border border-rf-ink-100 px-2 text-xs outline-none focus:border-rf-blue"
            />
          ) : (
            <>
              {/* DRAG EXCLUSION -- title only: shrinks to text width so most header background stays drag zone */}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!column.is_system) setIsEditing(true);
                }}
                className="max-w-full truncate text-left px-1 hover:text-rf-text-primary cursor-text disabled:cursor-default"
                disabled={column.is_system}
                title={column.name}
              >
                {column.name}
              </button>

              {/* DRAG EXCLUSION -- kebab at far right: stopPropagation prevents <th> listeners from activating drag */}
              {!column.is_system && (
                <button
                  ref={menuButtonRef}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(!menuOpen);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1 text-rf-text-secondary hover:text-rf-text-primary cursor-pointer text-sm leading-none"
                  aria-label={`${column.name} column options`}
                >
                  ⋮
                </button>
              )}
            </>
          )}
        </div>
        </>
      )}

      {/* Render menu in a portal */}
      {menuOpen && menuPosition && typeof window !== 'undefined' && createPortal(
        <>
          {/* Backdrop to close menu when clicking outside */}
          <div
            className="fixed inset-0 z-[998]"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="fixed z-[999] w-64 rounded-xl border border-rf-border bg-rf-surface-card shadow-2xl overflow-y-auto"
            style={{
              top: menuPosition.top != null ? `${menuPosition.top}px` : undefined,
              bottom: menuPosition.bottom != null ? `${menuPosition.bottom}px` : undefined,
              left: `${menuPosition.left}px`,
              maxHeight: `${menuPosition.maxHeight}px`,
            }}
          >
            {/* Column name header */}
            <div className="px-4 py-3 border-b border-rf-ink-100 bg-rf-surface-page">
              <p className="text-xs font-semibold text-rf-text-secondary uppercase tracking-wider truncate">{column.name}</p>
            </div>

            {/* Section 1 -- layout actions */}
            <div className="py-2">
              <button
                onClick={() => { onToggleMinimize(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
              >
                <ChevronsLeftRight className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                Minimize column
              </button>
              <button
                onClick={() => { onAddRight(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
              >
                <Plus className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                Add column to right
              </button>
            </div>

            <div className="border-t border-rf-ink-100" />

            {/* Section 2 -- edit actions */}
            <div className="py-2">
              <button
                onClick={() => { setIsEditing(true); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
              >
                <PencilLine className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                Rename column
              </button>
              <button
                onClick={() => { onWidthReset(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
              >
                <RotateCcw className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                Reset column width
              </button>
            </div>

            <div className="border-t border-rf-ink-100" />

            {/* Section 3 -- danger */}
            <div className="py-2">
              <button
                onClick={() => { onDelete(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-danger hover:bg-rf-danger-bg transition-colors text-left"
              >
                <Trash2 className="w-4 h-4 flex-shrink-0" />
                Delete column
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Resize handle */}
      {!isCollapsed && (
        <div
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none z-30 hover:bg-blue-400/30"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resizeStartX.current = e.clientX;
            resizeStartWidth.current = width;
            isResizing.current = true;
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!isResizing.current) return;
            const delta = e.clientX - resizeStartX.current;
            const newW = Math.max(COLUMN_MIN_WIDTH, Math.min(COLUMN_MAX_WIDTH, resizeStartWidth.current + delta));
            onWidthChange(newW);
          }}
          onPointerUp={(e) => {
            if (!isResizing.current) return;
            isResizing.current = false;
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
            const delta = e.clientX - resizeStartX.current;
            const newW = Math.max(COLUMN_MIN_WIDTH, Math.min(COLUMN_MAX_WIDTH, resizeStartWidth.current + delta));
            onWidthCommit(newW);
          }}
        />
      )}
    </div>
  );
}
