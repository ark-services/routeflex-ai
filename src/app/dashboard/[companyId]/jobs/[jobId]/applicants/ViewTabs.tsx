"use client";

import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
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
import { MoreHorizontal, Copy, Trash2, Pencil } from "lucide-react";
import type { BoardView } from "./view-actions";

// ─── Portal kebab menu ────────────────────────────────────────────────────────
// Renders via createPortal so stacking contexts inside the board can't clip it.

interface KebabMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  isDefault: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function KebabMenu({
  anchorEl,
  open,
  isDefault,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: KebabMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const updatePos = useCallback(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
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

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose, anchorEl]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-44 bg-white border border-stone-200 rounded-lg shadow-xl py-1"
    >
      <button
        onClick={() => { onClose(); onRename(); }}
        className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
      >
        <Pencil className="h-3.5 w-3.5" /> Rename
      </button>
      <button
        onClick={() => { onClose(); onDuplicate(); }}
        className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
      >
        <Copy className="h-3.5 w-3.5" /> Duplicate
      </button>
      {!isDefault && (
        <>
          <div className="my-1 border-t border-stone-100" />
          <button
            onClick={() => { onClose(); onDelete(); }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

// ─── Single sortable tab ──────────────────────────────────────────────────────

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
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-0.5 group shrink-0 ${
        isActive ? "border-b-2 border-blue-600" : "border-b-2 border-transparent"
      }`}
    >
      {/* Tab label */}
      <button
        {...attributes}
        {...listeners}
        onClick={() => { if (!isDragging) onClick(); }}
        className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer select-none ${
          isActive ? "text-blue-600" : "text-stone-600 hover:text-stone-900"
        }`}
        title={isDefault ? "Main table (cannot be deleted)" : view.name}
      >
        {view.name}
      </button>

      {/* Kebab trigger */}
      <button
        ref={btnRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-stone-100 rounded transition-opacity mr-1 shrink-0"
        title="View actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5 text-stone-500" />
      </button>

      {/* Portal menu — always above everything */}
      <KebabMenu
        anchorEl={btnRef.current}
        open={menuOpen}
        isDefault={isDefault}
        onClose={() => setMenuOpen(false)}
        onRename={() => onRename(view)}
        onDuplicate={() => onDuplicate(view)}
        onDelete={() => onDelete(view)}
      />
    </div>
  );
}

// ─── Rename modal ─────────────────────────────────────────────────────────────

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

  useEffect(() => { inputRef.current?.select(); }, []);

  const submit = () => { const t = name.trim(); if (t) onSave(t); };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-stone-900 mb-4">Rename view</h3>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
          className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          placeholder="View name"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded">Cancel</button>
          <button onClick={submit} disabled={!name.trim()} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteViewModal({
  view,
  onConfirm,
  onClose,
}: {
  view: BoardView;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-stone-900 mb-2">Delete view?</h3>
        <p className="text-sm text-stone-500 mb-5">
          &ldquo;{view.name}&rdquo; will be permanently deleted.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded">Cancel</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main ViewTabs ────────────────────────────────────────────────────────────

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
    onReorder(arrayMove(views, oldIndex, newIndex).map((v) => v.id));
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={views.map((v) => v.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex items-end gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
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
          onSave={(name) => { onRename(renamingView.id, name); setRenamingView(null); }}
          onClose={() => setRenamingView(null)}
        />
      )}
      {deletingView && (
        <DeleteViewModal
          view={deletingView}
          onConfirm={() => { onDelete(deletingView.id); setDeletingView(null); }}
          onClose={() => setDeletingView(null)}
        />
      )}
    </>
  );
}
