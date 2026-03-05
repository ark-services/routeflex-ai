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
  jobTitle: string;
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
  // Default values modal
  onOpenDefaultValues?: () => void;
  // Super admin
  isSuperAdmin?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BoardToolbar({
  companyId,
  jobId,
  jobTitle,
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
  onOpenDefaultValues,
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

  // ── Switch view ───────────────────────────────────────────────────────────

  function switchView(viewId: string) {
    const v = views.find((v) => v.id === viewId);
    if (!v) return;
    setActiveViewId(viewId);
    onSearchChange(v.query.search ?? "");
    onFiltersChange(v.query.filters ?? []);
  }

  // ── Save as new view ──────────────────────────────────────────────────────
  // Receives the validated draft filters directly from FilterPanel so the
  // saved view reflects exactly what the user configured, not the stale
  // activeFilters closure value.

  async function handleSaveView(name: string, filtersToSave: ActiveFilter[]) {
    const query: BoardViewQuery = {
      search: searchQuery,
      filters: filtersToSave,
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
    <div className="shrink-0">

      {/* ── Row 1: Job title (primary) · Board actions (right) ───────────────
           Title is the visual anchor — large, bold, breathing room above + below.
           Board-level actions (Integrate, Automate) sit on the same row because
           they operate on the board as a whole, not on a specific view or search. */}
      <div className="flex items-center gap-3 px-8 pt-5 pb-2 min-w-0">

        <h1 className="text-[28px] font-black leading-tight tracking-tight text-rf-text-primary truncate min-w-0 flex-1">
          {jobTitle}
        </h1>

        {/* Board-level actions — right-aligned, compact */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Save as Template — super admin only */}
          {isSuperAdmin && (
            <button
              onClick={() => setSaveAsTemplateOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rf-border bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page hover:border-rf-ink-100 text-sm font-medium transition-colors"
              title="Save this job's layout as a template (Super Admin)"
            >
              <BookTemplate className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Save as Template…</span>
            </button>
          )}

          {/* Default values */}
          {onOpenDefaultValues && (
            <button
              onClick={onOpenDefaultValues}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rf-border bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page hover:border-rf-ink-100 text-sm font-medium transition-colors"
              title="Set default column values for new items"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Default values</span>
            </button>
          )}

          {/* Integrate */}
          <a
            href={integrationHref}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rf-border bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page hover:border-rf-ink-100 text-sm font-medium transition-colors"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Integrate</span>
          </a>

          {/* Automate */}
          <AutomateButton
            companyId={companyId}
            jobId={jobId}
            jobTitle={jobTitle}
            accountId={accountId}
            automations={automations}
            triggers={triggers}
            groups={groups}
          />

          {/* More "..." menu */}
          <div className="relative">
            <button
              ref={moreBtnRef}
              onClick={() => setMoreOpen((o) => !o)}
              className={`flex items-center justify-center h-8 w-8 rounded-lg border text-sm transition-colors ${
                moreOpen
                  ? "border-rf-ink-100 bg-rf-ink-100 text-rf-ink-700"
                  : "border-rf-border bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page hover:border-rf-ink-100"
              }`}
              title="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {moreOpen && (
              <div
                ref={moreMenuRef}
                className="absolute right-0 top-full mt-1 w-44 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg z-50 py-1"
              >
                <button
                  onClick={() => { setMoreOpen(false); onOpenActivityLog(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors"
                >
                  <ScrollText className="h-4 w-4 text-rf-text-secondary" />
                  Activity Log
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Row 2: View tabs (secondary) ─────────────────────────────────────
           Tabs sit directly under the title — they feel grouped to it.
           No top border here; the spacing from Row 1's pb-3 provides the gap. */}
      {views.length > 0 && (
        <div
          className="px-8 overflow-x-auto"
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

      {/* ── Row 3: Utility toolbar — Search · Filter (tertiary) ──────────────
           Separated from tabs by a hairline border, making it clearly a
           utility layer rather than part of the navigation hierarchy. */}
      {/* suppressHydrationWarning on this row + its inputs/buttons because Dashlane
           injects data-dashlane-* attributes onto form-adjacent elements after SSR,
           causing a React hydration mismatch. This prop tells React to ignore
           attribute differences on these specific nodes only. */}
      <div className="flex items-center gap-2 px-8 py-2" suppressHydrationWarning>

        {/* Search — collapses/expands on focus */}
        <div
          className="relative transition-[width] duration-200 ease-in-out shrink-0"
          style={{ width: searchExpanded ? 260 : 140 }}
        >
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rf-text-muted pointer-events-none" />
          <input
            suppressHydrationWarning
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search"
            className="w-full h-8 pl-8 pr-7 rounded-lg border border-rf-border bg-white text-sm text-rf-ink-700 placeholder-rf-text-muted focus:outline-none focus:border-rf-blue focus:ring-2 focus:ring-rf-blue/20 transition-all"
          />
          {searchQuery && (
            <button
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focused
                onSearchChange("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-rf-text-muted hover:text-rf-ink-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter */}
        <button
          suppressHydrationWarning
          ref={filterBtnRef}
          onClick={() => setFilterOpen((o) => !o)}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-sm font-medium transition-colors shrink-0 ${
            filterOpen || activeFilters.length > 0
              ? "border-blue-400 bg-rf-blue-tint text-rf-blue"
              : "border-rf-border bg-rf-surface-page text-rf-ink-500 hover:bg-rf-surface-page"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Filter</span>
          {activeFilters.length > 0 && (
            <span className="bg-rf-blue text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
              {activeFilters.length}
            </span>
          )}
        </button>

      </div>

      {/* ── Filter panel — portal anchored below filter button ────────────── */}
      <FilterPanel
        open={filterOpen}
        anchorEl={filterBtnRef.current}
        columns={columns}
        statusLabels={statusLabels}
        filters={activeFilters}
        onFiltersChange={onFiltersChange}
        onClose={() => setFilterOpen(false)}
        onSaveView={handleSaveView}
      />

      {/* ── Save as Template modal ────────────────────────────────────────── */}
      <SaveAsTemplateModal
        open={saveAsTemplateOpen}
        onClose={() => setSaveAsTemplateOpen(false)}
        companyId={companyId}
        jobId={jobId}
      />
    </div>
  );
}
