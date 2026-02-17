"use client";

import { useRef, useState, useEffect } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontal, Check, Copy, Trash2, Pencil } from "lucide-react";
import type { BoardView } from "./view-actions";

// ─── Single draggable tab ─────────────────────────────────────────────────────

function SortableTab({
  view,
  isActive,
  isDefault,
  onClick,
  onRename,
  onDuplicate,
  onDelete,
}: {
  view: BoardView;
  isActive: boolean;
  isDefault: boolean;
  onClick: () => void;
  onRename: (view: BoardView) => void;
  onDuplicate: (view: BoardView) => void;
  onDelete: (view: BoardView) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: view.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-1 group shrink-0 ${
        isActive
          ? "border-b-2 border-blue-600"
          : "border-b-2 border-transparent"
      }`}
    >
      {/* Tab label – click to switch, drag handle */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => {
          // Don't activate if dragging started
          if (!isDragging) onClick();
        }}
        className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer select-none ${
          isActive
            ? "text-blue-600"
            : "text-stone-600 hover:text-stone-900"
        }`}
        title={isDefault ? "Main table (cannot be deleted)" : view.name}
      >
        {view.name}
      </button>

      {/* Kebab menu – only show on hover or when active */}
      <div className="relative" ref={menuRef}>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-stone-100 rounded transition-opacity mr-1"
          title="View actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-stone-500" />
        </button>

        {menuOpen && (
          <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-stone-200 rounded-lg shadow-lg z-50 py-1">
            <button
              onClick={() => {
                setMenuOpen(false);
                onRename(view);
              }}
              className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
            >
              <Pencil className="h-3.5 w-3.5" /> Rename
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onDuplicate(view);
              }}
              className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
            {!isDefault && (
              <>
                <div className="my-1 border-t border-stone-100" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(view);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Rename modal (inline) ────────────────────────────────────────────────────

function RenameViewModal({
  view,
  onSave,
  onClose,
}: {
  view: BoardView;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(view.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-stone-900 mb-4">
          Rename view
        </h3>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
          className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          placeholder="View name"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteViewModal({
  view,
  onConfirm,
  onClose,
}: {
  view: BoardView;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-stone-900 mb-2">
          Delete view?
        </h3>
        <p className="text-sm text-stone-500 mb-5">
          &ldquo;{view.name}&rdquo; will be permanently deleted.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ViewTabs component ──────────────────────────────────────────────────

export interface ViewTabsProps {
  views: BoardView[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onRename: (viewId: string, name: string) => void;
  onDuplicate: (viewId: string) => void;
  onDelete: (viewId: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function ViewTabs({
  views,
  activeViewId,
  onViewChange,
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
}: ViewTabsProps) {
  const [renamingView, setRenamingView] = useState<BoardView | null>(null);
  const [deletingView, setDeletingView] = useState<BoardView | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = views.findIndex((v) => v.id === active.id);
    const newIndex = views.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(views, oldIndex, newIndex);
    onReorder(newOrder.map((v) => v.id));
  }

  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={views.map((v) => v.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            ref={scrollRef}
            className="flex items-end gap-0 overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: "none" }}
          >
            {views.map((view) => (
              <SortableTab
                key={view.id}
                view={view}
                isActive={view.id === activeViewId}
                isDefault={view.is_default}
                onClick={() => onViewChange(view.id)}
                onRename={(v) => setRenamingView(v)}
                onDuplicate={(v) => onDuplicate(v.id)}
                onDelete={(v) => setDeletingView(v)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {renamingView && (
        <RenameViewModal
          view={renamingView}
          onSave={(name) => {
            onRename(renamingView.id, name);
            setRenamingView(null);
          }}
          onClose={() => setRenamingView(null)}
        />
      )}

      {deletingView && (
        <DeleteViewModal
          view={deletingView}
          onConfirm={() => {
            onDelete(deletingView.id);
            setDeletingView(null);
          }}
          onClose={() => setDeletingView(null)}
        />
      )}
    </>
  );
}
