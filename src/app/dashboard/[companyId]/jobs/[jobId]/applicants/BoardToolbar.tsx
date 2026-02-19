"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { Search, SlidersHorizontal, X, Link2, Zap, BookTemplate, MoreHorizontal, ScrollText } from "lucide-react";
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
import { AutomateButton } from "./AutomateButton";
import { SaveAsTemplateModal } from "./SaveAsTemplateModal";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BoardToolbarProps {
  companyId: string;
  jobId: string;
  boardId: string;
  columns: BoardColumn[];
  statusLabels: BoardStatusLabel[];
  initialViews: BoardView[];
  // Shared search/filter state (owned by parent container)
  searchQuery: string;
  activeFilters: ActiveFilter[];
  onSearchChange: (q: string) => void;
  onFiltersChange: (f: ActiveFilter[]) => void;
  // Integrate + Automate
  integrationHref: string;
  accountId: string;
  automations: any[];
  triggers: any[];
  groups: any[];
  // Activity log
  onOpenActivityLog: () => void;
  // Super admin
  isSuperAdmin?: boolean;
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
  integrationHref,
  accountId,
  automations,
  triggers,
  groups,
  onOpenActivityLog,
  isSuperAdmin = false,
}: BoardToolbarProps) {
  const [views, setViews] = useState<BoardView[]>(initialViews);
  const [activeViewId, setActiveViewId] = useState<string>(
    initialViews.find((v) => v.is_default)?.id ?? initialViews[0]?.id ?? ""
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close "..." menu on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        moreBtnRef.current?.contains(e.target as Node) ||
        moreMenuRef.current?.contains(e.target as Node)
      ) return;
      setMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  // ── Dirty detection ───────────────────────────────────────────────────────

  const currentView = views.find((v) => v.id === activeViewId);
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
      if (error) { alert(error); return; }
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
    const newViews = views.filter((v) => v.id !== viewId);
    setViews(newViews);
    if (activeViewId === viewId) {
      const fallback = newViews.find((v) => v.is_default) ?? newViews[0];
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

  const searchExpanded = searchFocused || searchQuery.length > 0;

  return (
    <div className="bg-white border-b border-stone-200 shrink-0">

      {/* ── Row 1: Search · Filter · ··· · [Save as Template] · Integrate · Automate */}
      <div className="flex items-center gap-2 px-4 py-2">

        {/* Search — collapses/expands on focus */}
        <div
          className="relative transition-[width] duration-200 ease-in-out shrink-0"
          style={{ width: searchExpanded ? 260 : 140 }}
        >
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search"
            className="w-full h-8 pl-8 pr-7 rounded-lg border border-stone-200 bg-stone-50 text-sm text-stone-700 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          />
          {searchQuery && (
            <button
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focused
                onSearchChange("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter button — ref used by FilterPanel for portal positioning */}
        <button
          ref={filterBtnRef}
          onClick={() => setFilterOpen((o) => !o)}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-sm font-medium transition-colors shrink-0 ${
            filterOpen || activeFilters.length > 0
              ? "border-blue-400 bg-blue-50 text-blue-700"
              : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Filter</span>
          {activeFilters.length > 0 && (
            <span className="bg-blue-600 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
              {activeFilters.length}
            </span>
          )}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save as Template — super admin only */}
        {isSuperAdmin && (
          <button
            onClick={() => setSaveAsTemplateOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 text-sm font-medium transition-colors shrink-0"
            title="Save this job's layout as a template (Super Admin)"
          >
            <BookTemplate className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Save as Template…</span>
          </button>
        )}

        {/* Integrate */}
        <a
          href={integrationHref}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:border-stone-300 text-sm font-medium transition-colors shrink-0"
        >
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">Integrate</span>
        </a>

        {/* Automate */}
        <AutomateButton
          companyId={companyId}
          jobId={jobId}
          accountId={accountId}
          automations={automations}
          triggers={triggers}
          groups={groups}
        />

        {/* More "..." menu */}
        <div className="relative shrink-0">
          <button
            ref={moreBtnRef}
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex items-center justify-center h-8 w-8 rounded-lg border text-sm transition-colors ${
              moreOpen
                ? "border-stone-300 bg-stone-100 text-stone-700"
                : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:border-stone-300"
            }`}
            title="More options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {moreOpen && (
            <div
              ref={moreMenuRef}
              className="absolute right-0 top-full mt-1 w-44 bg-white border border-stone-200 rounded-lg shadow-lg z-50 py-1"
            >
              <button
                onClick={() => { setMoreOpen(false); onOpenActivityLog(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <ScrollText className="h-4 w-4 text-stone-500" />
                Activity Log
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter panel — portal overlay anchored below filter button ────── */}
      <FilterPanel
        open={filterOpen}
        anchorEl={filterBtnRef.current}
        columns={columns}
        statusLabels={statusLabels}
        filters={activeFilters}
        onFiltersChange={onFiltersChange}
        onClose={() => setFilterOpen(false)}
        onSaveView={handleSaveView}
        isDirty={isDirty}
      />

      {/* ── Row 2: View tabs ─────────────────────────────────────────────────── */}
      {views.length > 0 && (
        <div
          className="px-4 overflow-x-auto border-t border-stone-100"
          style={{ scrollbarWidth: "none" }}
        >
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

      {/* ── Save as Template modal ────────────────────────────────────────────── */}
      <SaveAsTemplateModal
        open={saveAsTemplateOpen}
        onClose={() => setSaveAsTemplateOpen(false)}
        companyId={companyId}
        jobId={jobId}
      />
    </div>
  );
}
