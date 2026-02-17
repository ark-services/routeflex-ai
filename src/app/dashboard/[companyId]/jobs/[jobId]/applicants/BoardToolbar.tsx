"use client";

import { useRef, useState, useTransition } from "react";
import { Search, SlidersHorizontal, Plus, X } from "lucide-react";
import type { BoardColumn, BoardStatusLabel } from "@/lib/types";
import type { ActiveFilter, BoardView, BoardViewQuery } from "./view-actions";
import {
  createBoardView,
  updateBoardView,
  deleteBoardView,
  duplicateBoardView,
  reorderBoardViews,
} from "./view-actions";
import { FilterPanel } from "./FilterPanel";
import { ViewTabs } from "./ViewTabs";

// ─── "Save as new view" modal ─────────────────────────────────────────────────

function SaveViewModal({
  onSave,
  onClose,
}: {
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus
  setTimeout(() => inputRef.current?.focus(), 0);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-stone-900 mb-4">
          Save as new view
        </h3>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="View name"
          className="w-full rounded border border-stone-200 px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
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

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BoardToolbarProps {
  companyId: string;
  jobId: string;
  boardId: string;
  columns: BoardColumn[];
  statusLabels: BoardStatusLabel[];
  initialViews: BoardView[];
  // Current filter/search state lifted up to container
  searchQuery: string;
  activeFilters: ActiveFilter[];
  onSearchChange: (q: string) => void;
  onFiltersChange: (f: ActiveFilter[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BoardToolbar({
  companyId,
  jobId,
  boardId,
  columns,
  statusLabels,
  initialViews,
  searchQuery,
  activeFilters,
  onSearchChange,
  onFiltersChange,
}: BoardToolbarProps) {
  const [views, setViews] = useState<BoardView[]>(initialViews);
  const [activeViewId, setActiveViewId] = useState<string>(
    initialViews.find((v) => v.is_default)?.id ?? initialViews[0]?.id ?? ""
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // ── Helpers ──────────────────────────────────────────────────────────────

  const currentView = views.find((v) => v.id === activeViewId);
  const activeQuery: BoardViewQuery = currentView?.query ?? {
    search: "",
    filters: [],
    logic: "and",
  };

  // Dirty = current (search + filters) differs from the selected view's saved state
  const isDirty =
    searchQuery !== (currentView?.query.search ?? "") ||
    JSON.stringify(activeFilters) !==
      JSON.stringify(currentView?.query.filters ?? []);

  // ── Switch view ───────────────────────────────────────────────────────────

  function switchView(viewId: string) {
    const v = views.find((v) => v.id === viewId);
    if (!v) return;
    setActiveViewId(viewId);
    onSearchChange(v.query.search ?? "");
    onFiltersChange(v.query.filters ?? []);
  }

  // ── Save as new view ──────────────────────────────────────────────────────

  async function handleSaveView(name: string) {
    setSaveModalOpen(false);
    const query: BoardViewQuery = {
      search: searchQuery,
      filters: activeFilters,
      logic: "and",
    };
    startTransition(async () => {
      const { data, error } = await createBoardView(
        companyId,
        jobId,
        boardId,
        name,
        query
      );
      if (error) {
        alert(error);
        return;
      }
      if (data) {
        setViews((prev) => [...prev, data]);
        setActiveViewId(data.id);
      }
    });
  }

  // ── Rename view ───────────────────────────────────────────────────────────

  async function handleRename(viewId: string, name: string) {
    setViews((prev) =>
      prev.map((v) => (v.id === viewId ? { ...v, name } : v))
    );
    startTransition(async () => {
      await updateBoardView(companyId, jobId, viewId, { name });
    });
  }

  // ── Duplicate view ────────────────────────────────────────────────────────

  async function handleDuplicate(viewId: string) {
    startTransition(async () => {
      const { data, error } = await duplicateBoardView(
        companyId,
        jobId,
        boardId,
        viewId
      );
      if (error) { alert(error); return; }
      if (data) {
        setViews((prev) => [...prev, data]);
        setActiveViewId(data.id);
        onSearchChange(data.query.search ?? "");
        onFiltersChange(data.query.filters ?? []);
      }
    });
  }

  // ── Delete view ───────────────────────────────────────────────────────────

  async function handleDelete(viewId: string) {
    const deletedView = views.find((v) => v.id === viewId);
    const newViews = views.filter((v) => v.id !== viewId);
    setViews(newViews);

    // If we deleted the active view, switch to main (default) or first
    if (activeViewId === viewId) {
      const fallback =
        newViews.find((v) => v.is_default) ?? newViews[0];
      if (fallback) switchView(fallback.id);
    }

    startTransition(async () => {
      await deleteBoardView(companyId, jobId, viewId);
    });
  }

  // ── Reorder views ─────────────────────────────────────────────────────────

  function handleReorder(orderedIds: string[]) {
    const reordered = orderedIds
      .map((id) => views.find((v) => v.id === id))
      .filter(Boolean) as BoardView[];
    setViews(reordered);
    startTransition(async () => {
      await reorderBoardViews(companyId, jobId, orderedIds);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-white border-b border-stone-200">
        {/* Top row: search + filter + save */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-stone-100">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search"
              className="w-full h-8 pl-8 pr-8 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-700 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter button */}
          <button
            onClick={() => setFilterOpen(true)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-sm font-medium transition-colors ${
              activeFilters.length > 0
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filter</span>
            {activeFilters.length > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {activeFilters.length}
              </span>
            )}
          </button>

          {/* Clear filters pill */}
          {activeFilters.length > 0 && (
            <button
              onClick={() => onFiltersChange([])}
              className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs text-stone-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
              title="Clear all filters"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Save as new view */}
          <button
            onClick={() => setSaveModalOpen(true)}
            disabled={!isDirty || isPending}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-sm font-medium transition-colors ${
              isDirty && !isPending
                ? "border-blue-500 bg-blue-600 text-white hover:bg-blue-700"
                : "border-stone-200 bg-stone-50 text-stone-400 cursor-not-allowed"
            }`}
            title={
              isDirty
                ? "Save current search & filters as a new view"
                : "No changes from saved view"
            }
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Save as new view</span>
            <span className="sm:hidden">Save view</span>
          </button>
        </div>

        {/* View tabs row */}
        {views.length > 0 && (
          <div className="px-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <ViewTabs
              views={views}
              activeViewId={activeViewId}
              onViewChange={switchView}
              onRename={handleRename}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onReorder={handleReorder}
            />
          </div>
        )}
      </div>

      {/* Filter panel */}
      <FilterPanel
        open={filterOpen}
        columns={columns}
        statusLabels={statusLabels}
        filters={activeFilters}
        onFiltersChange={onFiltersChange}
        onClose={() => setFilterOpen(false)}
      />

      {/* Save view modal */}
      {saveModalOpen && (
        <SaveViewModal
          onSave={handleSaveView}
          onClose={() => setSaveModalOpen(false)}
        />
      )}
    </>
  );
}
