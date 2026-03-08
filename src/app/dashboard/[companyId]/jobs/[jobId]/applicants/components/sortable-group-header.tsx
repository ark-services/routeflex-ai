"use client";

import { useEffect, useState, useRef } from "react";
import {
  ArrowLeftRight,
  PencilLine,
  Trash2,
  ChevronsLeftRight,
  Eye,
  EyeOff,
  Pin,
} from "lucide-react";
import { createPortal } from "react-dom";
import type React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PortalChecklistItem } from "../portal-actions";
import type { Group, BoardColumn, StatusLabel } from "./types";
import { PRESET_COLORS } from "./types";

export function SortableGroupHeader({
  group,
  rowCount,
  isCollapsed,
  onToggleCollapse,
  onColorChange,
  isEditing,
  editValue,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onChange,
  menuOpen,
  onMenuToggle,
  onRename,
  onDelete,
  onMinimizeAll,
  onExpandAll,
  allColumns,
  onHideColumn,
  onShowColumn,
  onUpdatePortalVisibility,
  onUpdatePortalNote,
  onUpdatePortalChecklist,
  columns,
  labelsByColumn,
  canDelete = true,
  frozenColumnsCount,
  onFreezeColumns,
}: {
  group: Group;
  rowCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onColorChange: (color: string) => void;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onChange: (val: string) => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMinimizeAll: () => void;
  onExpandAll: () => void;
  allColumns: BoardColumn[];
  onHideColumn: (columnId: string) => void;
  onShowColumn: (columnId: string) => void;
  onUpdatePortalVisibility: (visible: boolean) => void;
  onUpdatePortalNote: (note: string) => void;
  onUpdatePortalChecklist: (checklist: PortalChecklistItem[]) => void;
  columns: BoardColumn[];
  labelsByColumn: Map<string, StatusLabel[]>;
  canDelete?: boolean;
  frozenColumnsCount: number;
  onFreezeColumns: (n: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `group-${group.id}`,
    disabled: isEditing,
  });

  const dndTransform = CSS.Transform.toString(transform);
  const style: React.CSSProperties = {
    // Use `undefined` (not "") so browsers don't apply a no-op transform,
    // which would break position:sticky.
    transform: dndTransform || undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    // Left color strip -- shows both in-flow and while sticky.
    borderLeftColor: group.color,
  };

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [clientMounted, setClientMounted] = useState(false);
  const [showColumnsSection, setShowColumnsSection] = useState(false);

  useEffect(() => { setClientMounted(true); }, []);

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
          bottom: window.innerHeight - rect.top + (window.scrollY > 0 ? 0 : 0),
          left: rect.left + window.scrollX,
          maxHeight: spaceAbove - MARGIN,
        });
      }
    } else {
      setMenuPosition(null);
    }
  }, [menuOpen]);

  // Calculate color picker position when rename starts
  useEffect(() => {
    if (!isEditing || !inputRef.current) return;
    const update = () => {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      setPickerPos({ top: rect.bottom + 6, left: rect.left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [isEditing]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-rf-surface-card
        rounded-t-[14px] border-b border-rf-ink-100
        sticky top-0 z-30
        ${isDragging ? "" : "shadow-[0_1px_0_0_rgb(0,0,0,0.04)]"}`}
      {...attributes}
    >
      {/* Inner content -- sticky left-0 keeps the group name pinned at the
          left edge of the viewport when scrolling right. Using a narrow
          (w-max) div is the key: sticky only works when the element is
          narrower than its containing block. The full-width outer div
          provides the background; this div just sticks the name. */}
      <div className="sticky left-0 w-max flex items-center gap-3 px-5 py-3.5 bg-rf-surface-card">
      {/* Drag handle */}
      <button
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-rf-text-muted hover:text-rf-ink-500 text-sm transition-opacity"
        aria-label="Drag to reorder group"
      >
        ⋮⋮
      </button>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="text-rf-text-secondary hover:text-rf-text-primary text-sm"
        aria-label={isCollapsed ? `Expand ${group.name} group` : `Collapse ${group.name} group`}
      >
        {isCollapsed ? "▶" : "▼"}
      </button>

      {/* Inline editable name -- color matches group color */}
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
          style={{ color: group.color, borderColor: group.color }}
          className="h-7 w-48 rounded border-2 px-2 text-sm font-semibold outline-none bg-rf-surface-card"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
      ) : (
        <button
          onClick={onStartEdit}
          style={{ color: group.color }}
          className="text-base font-semibold cursor-text hover:opacity-75 transition-opacity"
          title="Click to rename"
        >
          {group.name}
        </button>
      )}

      <span className="text-sm text-rf-text-muted">({rowCount})</span>

      {/* Kebab menu button */}
      <button
        ref={menuButtonRef}
        onClick={onMenuToggle}
        className="opacity-0 group-hover:opacity-100 ml-1 p-1 rounded hover:bg-rf-surface-page text-rf-text-secondary hover:text-rf-text-primary transition-opacity"
        title="Group actions"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="2" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
        </svg>
      </button>
      </div>{/* end inner translateX div */}

      {/* Color picker portal -- only while rename mode is active (skip until positioned) */}
      {isEditing && clientMounted && pickerPos.top > 0 && createPortal(
        <div
          style={{ position: "fixed", top: pickerPos.top, left: pickerPos.left, zIndex: 9999 }}
          className="rounded-xl border border-rf-border bg-rf-surface-card p-2.5 shadow-xl"
          onMouseDown={(e) => e.preventDefault()} // keep input focused when clicking colors
        >
          <p className="text-[10px] font-medium text-rf-text-muted uppercase tracking-wide mb-2 px-0.5">
            Group color
          </p>
          <div className="grid grid-cols-8 gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onColorChange(color)}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  group.color === color ? "border-rf-ink-700 scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Kebab menu portal */}
      {menuOpen && menuPosition && clientMounted && createPortal(
        <>
          <div
            className="fixed inset-0 z-[998]"
            onClick={onMenuToggle}
          />
          <div
            className="fixed z-[999] w-64 rounded-xl border border-rf-border bg-rf-surface-card shadow-2xl flex flex-col"
            style={{
              top: menuPosition.top != null ? `${menuPosition.top}px` : undefined,
              bottom: menuPosition.bottom != null ? `${menuPosition.bottom}px` : undefined,
              left: `${menuPosition.left}px`,
              maxHeight: `${menuPosition.maxHeight}px`,
            }}
          >
            {/* Group name header */}
            <div className="px-4 py-3 border-b border-rf-ink-100 bg-rf-surface-page flex-shrink-0 rounded-t-xl">
              <p className="text-xs font-semibold text-rf-text-secondary uppercase tracking-wider truncate">{group.name}</p>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 min-h-0">

            {/* Section 1 -- column visibility */}
            <div className="py-2">
              {/* Collapsible "Columns" accordion header */}
              <button
                onClick={() => setShowColumnsSection((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
              >
                <Eye className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                <span className="flex-1 font-medium">Columns</span>
                {allColumns.filter((c) => !c.is_system && (group.settings?.hidden_columns ?? []).includes(c.id)).length > 0 && (
                  <span className="text-[10px] font-semibold bg-rf-blue-tint text-rf-blue rounded-full px-1.5 py-0.5 leading-none">
                    {allColumns.filter((c) => !c.is_system && (group.settings?.hidden_columns ?? []).includes(c.id)).length} hidden
                  </span>
                )}
                <span className="text-xs text-rf-text-muted ml-1">{showColumnsSection ? "▲" : "▼"}</span>
              </button>

              {/* Expanded: per-column checkboxes */}
              {showColumnsSection && (
                <div className="pb-1">
                  {allColumns.filter((col) => !col.is_system).map((col) => {
                    const isHidden = (group.settings?.hidden_columns ?? []).includes(col.id);
                    return (
                      <label
                        key={col.id}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page cursor-pointer"
                      >
                        {isHidden ? (
                          <EyeOff className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                        ) : (
                          <Eye className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                        )}
                        <span className={isHidden ? "text-rf-text-muted" : ""}>{col.name}</span>
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={() => isHidden ? onShowColumn(col.id) : onHideColumn(col.id)}
                          className="ml-auto h-4 w-4 rounded border-rf-ink-100 text-rf-blue cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Minimize / expand width shortcuts */}
              <div className="border-t border-rf-ink-100 mt-1 pt-1">
                <button
                  onClick={onMinimizeAll}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-500 hover:bg-rf-surface-page transition-colors text-left"
                >
                  <ChevronsLeftRight className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                  Minimize all
                </button>
                <button
                  onClick={onExpandAll}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-500 hover:bg-rf-surface-page transition-colors text-left"
                >
                  <ArrowLeftRight className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                  Expand all
                </button>
              </div>

              {/* Freeze columns */}
              <div className="border-t border-rf-ink-100 mt-1 pt-1">
                <p className="px-4 py-1.5 text-xs font-semibold text-rf-text-muted uppercase tracking-wider">Freeze columns</p>
                {[0, ...Array.from({ length: Math.min(3, columns.length) }, (_, i) => i + 1)].map((n) => (
                  <button
                    key={n}
                    onClick={() => { onFreezeColumns(n); onMenuToggle(); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-500 hover:bg-rf-surface-page transition-colors text-left"
                  >
                    <Pin className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                    {n === 0 ? "None" : `${n} column${n > 1 ? "s" : ""}`}
                    {frozenColumnsCount === n && (
                      <span className="ml-auto text-rf-blue font-bold text-xs">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-rf-ink-100" />

            {/* Section 2 -- edit */}
            <div className="py-2">
              <button
                onClick={onRename}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
              >
                <PencilLine className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                Rename
              </button>
            </div>

            {/* Section 3 -- applicant portal settings */}
            <div className="border-t border-rf-ink-100" />
            <div className="px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-rf-text-muted uppercase tracking-wider">Applicant Portal</p>

              {/* Visibility toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={group.visible_to_applicants !== false}
                  onChange={(e) => onUpdatePortalVisibility(e.target.checked)}
                  className="w-4 h-4 rounded border-rf-ink-100 text-rf-blue"
                />
                <span className="text-sm text-rf-ink-700">Show this step to applicants</span>
              </label>

              {group.visible_to_applicants !== false && (
                <>
                  {/* Note */}
                  <textarea
                    rows={2}
                    className="w-full text-xs border border-rf-border rounded-lg px-2.5 py-2 resize-none placeholder:text-rf-text-muted focus:outline-none focus:border-rf-blue-tint"
                    placeholder="Note shown to applicants at this step..."
                    defaultValue={group.applicant_note ?? ""}
                    onBlur={(e) => onUpdatePortalNote(e.target.value.trim())}
                  />

                  {/* Completion requirements */}
                  <div>
                    <p className="text-xs font-medium text-rf-text-secondary mb-2">Completion requirements</p>
                    <div className="space-y-2">
                      {(group.settings?.portal_checklist ?? []).map((item, idx) => {
                        const itemLabels = labelsByColumn.get(item.column_id) ?? [];
                        const col = columns.find((c) => c.id === item.column_id);
                        const dateColumns = columns.filter((c) => c.type === "date");
                        const isStatusCol = col?.type === "status";
                        return (
                          <div key={item.id} className="rounded-lg border border-rf-border bg-rf-surface-page p-2 space-y-1.5">
                            {/* Column picker + remove */}
                            <div className="flex items-center gap-1.5">
                              <select
                                value={item.column_id}
                                onChange={(e) => {
                                  const next = (group.settings?.portal_checklist ?? []).map((it, i) =>
                                    i === idx ? { ...it, column_id: e.target.value, pass_label_id: null, date_column_id: null } : it
                                  );
                                  onUpdatePortalChecklist(next);
                                }}
                                className="flex-1 min-w-0 text-xs border border-rf-border rounded px-1.5 py-1 bg-rf-surface-card focus:outline-none focus:border-rf-blue-tint"
                              >
                                {columns.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => {
                                  const next = (group.settings?.portal_checklist ?? []).filter((_, i) => i !== idx);
                                  onUpdatePortalChecklist(next);
                                }}
                                className="flex-shrink-0 text-rf-text-muted hover:text-rf-danger transition-colors text-base leading-none px-0.5"
                                title="Remove"
                              >
                                x
                              </button>
                            </div>
                            {/* Pass label + optional date column (status cols only) */}
                            {isStatusCol && (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={item.pass_label_id ?? ""}
                                  onChange={(e) => {
                                    const next = (group.settings?.portal_checklist ?? []).map((it, i) =>
                                      i === idx ? { ...it, pass_label_id: e.target.value || null } : it
                                    );
                                    onUpdatePortalChecklist(next);
                                  }}
                                  className="flex-1 min-w-0 text-xs border border-rf-border rounded px-1.5 py-1 bg-rf-surface-card focus:outline-none focus:border-rf-blue-tint"
                                >
                                  <option value="">any value</option>
                                  {itemLabels.map((l) => (
                                    <option key={l.id} value={l.id}>{l.label}</option>
                                  ))}
                                </select>
                                <select
                                  value={item.date_column_id ?? ""}
                                  onChange={(e) => {
                                    const next = (group.settings?.portal_checklist ?? []).map((it, i) =>
                                      i === idx ? { ...it, date_column_id: e.target.value || null } : it
                                    );
                                    onUpdatePortalChecklist(next);
                                  }}
                                  className="flex-1 min-w-0 text-xs border border-rf-border rounded px-1.5 py-1 bg-rf-surface-card focus:outline-none focus:border-rf-blue-tint"
                                >
                                  <option value="">+ date</option>
                                  {dateColumns.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => {
                        if (columns.length === 0) return;
                        const first = columns[0];
                        const newItem: PortalChecklistItem = {
                          id: crypto.randomUUID(),
                          column_id: first.id,
                          pass_label_id: null,
                        };
                        onUpdatePortalChecklist([...(group.settings?.portal_checklist ?? []), newItem]);
                      }}
                      className="mt-1.5 text-xs text-rf-blue hover:text-blue-800 font-medium"
                    >
                      + Add requirement
                    </button>
                  </div>
                </>
              )}
            </div>

            {canDelete && (
              <>
                <div className="border-t border-rf-ink-100" />
                <div className="py-2">
                  <button
                    onClick={onDelete}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-danger hover:bg-rf-danger-bg transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4 flex-shrink-0" />
                    Delete
                  </button>
                </div>
              </>
            )}

            {/* End scrollable body */}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
