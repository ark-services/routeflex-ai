"use client";

/**
 * ViewTabs — Monday-style view tab bar with drag-to-reorder.
 *
 * Hydration strategy (Option A):
 *   • `mounted` starts as `false` on both server and client (hydration pass).
 *   • Server + hydration pass render <StaticTabList> — plain HTML, no dnd-kit
 *     hooks, no aria-describedby → server HTML === client hydration HTML.
 *   • After mount useEffect fires → `mounted` becomes `true` → React replaces
 *     StaticTabList with SortableTabList (full dnd-kit, fully interactive).
 *   • This eliminates the DndDescribedBy-N counter mismatch on browser Back.
 */

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
  type DragEndEvent,
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

// ─── Shared tab appearance props ──────────────────────────────────────────────

interface TabSharedProps {
  view: BoardView;
  isActive: boolean;
  isDefault: boolean;
  onClick: () => void;
  onRename: (view: BoardView) => void;
  onDuplicate: (view: BoardView) => void;
  onDelete: (view: BoardView) => void;
}

// ─── Portal kebab menu ────────────────────────────────────────────────────────

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

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-44 bg-rf-surface-card border border-rf-border rounded-lg shadow-xl py-1"
    >
      <button
        onClick={() => { onClose(); onRename(); }}
        className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page flex items-center gap-2"
      >
        <Pencil className="h-3.5 w-3.5" /> Rename
      </button>
      <button
        onClick={() => { onClose(); onDuplicate(); }}
        className="w-full text-left px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page flex items-center gap-2"
      >
        <Copy className="h-3.5 w-3.5" /> Duplicate
      </button>
      {!isDefault && (
        <>
          <div className="my-1 border-t border-rf-ink-100" />
          <button
            onClick={() => { onClose(); onDelete(); }}
            className="w-full text-left px-4 py-2 text-sm text-rf-danger hover:bg-rf-danger-bg flex items-center gap-2"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

// ─── Shared tab chrome (used by both static and sortable variants) ─────────────
// Extracted so both render identical DOM structure/classes.

function TabChrome({
  view,
  isActive,
  isDefault,
  onClick,
  onRename,
  onDuplicate,
  onDelete,
  // Optional drag props injected by SortableTab only
  dragProps,
}: TabSharedProps & {
  dragProps?: {
    ref: (node: HTMLElement | null) => void;
    style: React.CSSProperties;
    buttonAttrs: Record<string, unknown>;
    buttonListeners: Record<string, unknown>;
  };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const containerStyle = dragProps?.style ?? {};
  const containerRef = dragProps?.ref;

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className={`relative flex items-center gap-0.5 group shrink-0 ${
        isActive ? "border-b-2 border-rf-blue" : "border-b-2 border-transparent"
      }`}
    >
      {/* Tab label — receives drag attrs only in sortable mode */}
      <button
        {...(dragProps?.buttonAttrs ?? {})}
        {...(dragProps?.buttonListeners ?? {})}
        onClick={() => onClick()}
        className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer select-none ${
          isActive ? "text-rf-blue" : "text-rf-ink-500 hover:text-rf-text-primary"
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
        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 p-0.5 hover:bg-rf-surface-page rounded transition-opacity mr-1 shrink-0"
        title="View actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5 text-rf-text-secondary" />
      </button>

      {/* Portal menu — only rendered client-side (KebabMenu uses createPortal) */}
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

// ─── Static tab (SSR-safe, no dnd-kit hooks) ──────────────────────────────────
// Renders identical DOM to SortableTab but without useSortable.
// No aria-describedby attribute → no hydration mismatch.

function StaticTab(props: TabSharedProps) {
  return <TabChrome {...props} />;
}

// ─── Sortable tab (client-only, full dnd-kit) ─────────────────────────────────

function SortableTab(props: TabSharedProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.view.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <TabChrome
      {...props}
      onClick={() => { if (!isDragging) props.onClick(); }}
      dragProps={{
        ref: setNodeRef,
        style,
        buttonAttrs: attributes as unknown as Record<string, unknown>,
        buttonListeners: listeners as Record<string, unknown>,
      }}
    />
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
      <div className="relative bg-rf-surface-card rounded-xl shadow-2xl border border-rf-border w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-rf-text-primary mb-4">Rename view</h3>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
          className="w-full rounded border border-rf-border px-3 py-2 text-sm text-rf-ink-700 focus:outline-none focus:ring-2 focus:ring-rf-blue mb-4"
          placeholder="View name"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-rf-ink-500 hover:bg-rf-surface-page rounded">Cancel</button>
          <button onClick={submit} disabled={!name.trim()} className="px-3 py-1.5 text-sm bg-rf-blue text-white rounded hover:bg-rf-blue-dark disabled:opacity-40">Save</button>
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
      <div className="relative bg-rf-surface-card rounded-xl shadow-2xl border border-rf-border w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-rf-text-primary mb-2">Delete view?</h3>
        <p className="text-sm text-rf-text-secondary mb-5">&ldquo;{view.name}&rdquo; will be permanently deleted.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-rf-ink-500 hover:bg-rf-surface-page rounded">Cancel</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-sm bg-rf-danger text-white rounded hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Static tab list (SSR + hydration pass) ───────────────────────────────────

type InternalListProps = Omit<ViewTabsProps, "onReorder" | "onRename" | "onDuplicate" | "onDelete"> & {
  onRename: (view: BoardView) => void;
  onDuplicate: (view: BoardView) => void;
  onDelete: (view: BoardView) => void;
};

function StaticTabList({
  views,
  activeViewId,
  onViewChange,
  onRename,
  onDuplicate,
  onDelete,
}: Omit<InternalListProps, "onReorder">) {
  return (
    <div className="flex items-end gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      {views.map((view) => (
        <StaticTab
          key={view.id}
          view={view}
          isActive={view.id === activeViewId}
          isDefault={view.is_default}
          onClick={() => onViewChange(view.id)}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ─── Sortable tab list (client-only, after mount) ─────────────────────────────

function SortableTabList({
  views,
  activeViewId,
  onViewChange,
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
}: InternalListProps & { onReorder: ViewTabsProps["onReorder"] }) {
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
              onRename={onRename}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ─── Public ViewTabs (hydration-safe entry point) ────────────────────────────

export interface ViewTabsProps {
  views: BoardView[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onRename: (viewId: string, name: string) => void;
  onDuplicate: (viewId: string) => void;
  onDelete: (viewId: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function ViewTabs(props: ViewTabsProps) {
  // `mounted` is false on server and during the hydration pass.
  // This guarantees server HTML === initial client HTML (both use StaticTabList).
  // After mount, React replaces StaticTabList with SortableTabList on the client.
  const [mounted, setMounted] = useState(false);
  const [renamingView, setRenamingView] = useState<BoardView | null>(null);
  const [deletingView, setDeletingView] = useState<BoardView | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const { onRename: _extRename, ...restProps } = props;

  const internalRename = (v: BoardView) => setRenamingView(v);
  const internalDuplicate = (v: BoardView) => props.onDuplicate(v.id);
  const internalDelete = (v: BoardView) => setDeletingView(v);

  return (
    <>
      {mounted ? (
        <SortableTabList
          {...restProps}
          onRename={internalRename}
          onDuplicate={internalDuplicate}
          onDelete={internalDelete}
        />
      ) : (
        <StaticTabList
          views={props.views}
          activeViewId={props.activeViewId}
          onViewChange={props.onViewChange}
          onRename={internalRename}
          onDuplicate={internalDuplicate}
          onDelete={internalDelete}
        />
      )}

      {/* Modals use createPortal — only render client-side, triggered by user action */}
      {renamingView && (
        <RenameViewModal
          view={renamingView}
          onSave={(name) => { props.onRename(renamingView.id, name); setRenamingView(null); }}
          onClose={() => setRenamingView(null)}
        />
      )}
      {deletingView && (
        <DeleteViewModal
          view={deletingView}
          onConfirm={() => { props.onDelete(deletingView.id); setDeletingView(null); }}
          onClose={() => setDeletingView(null)}
        />
      )}
    </>
  );
}
