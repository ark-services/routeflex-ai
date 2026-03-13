import { useMemo, useRef } from "react";
import { useVirtualizer, defaultRangeExtractor } from "@tanstack/react-virtual";
import type { Group, ApplicantRow, BoardColumn } from "./types";
import { STICKY_COL_WIDTH, ADD_COL_BTN_WIDTH, getDefaultWidth } from "./types";

// ── Virtual item types ────────────────────────────────────────────────────────

export type VirtualItem =
  | { kind: "group-header"; groupId: string; group: Group; rowCount: number }
  | { kind: "column-headers"; groupId: string; group: Group; columns: BoardColumn[] }
  | { kind: "empty-row"; groupId: string; colSpan: number }
  | { kind: "applicant-row"; groupId: string; applicant: ApplicantRow }
  | { kind: "add-item-row"; groupId: string }
  | { kind: "group-spacer" }
  | { kind: "orphaned-header"; rowCount: number }
  | { kind: "orphaned-row"; applicant: ApplicantRow }
  | { kind: "add-group-button" }
  | { kind: "no-results" };

// ── Row height constants ──────────────────────────────────────────────────────

const GROUP_HEADER_HEIGHT = 53;
const COLUMN_HEADER_HEIGHT = 49;
const ROW_HEIGHT = 49;
const ADD_ITEM_HEIGHT = 48;
const EMPTY_ROW_HEIGHT = 64;
const GROUP_SPACER_HEIGHT = 32;
const ADD_GROUP_HEIGHT = 44;
const NO_RESULTS_HEIGHT = 200;
const ORPHANED_HEADER_HEIGHT = 56;

export { ROW_HEIGHT, COLUMN_HEADER_HEIGHT, GROUP_HEADER_HEIGHT };

function estimateSize(item: VirtualItem): number {
  switch (item.kind) {
    case "group-header":    return GROUP_HEADER_HEIGHT;
    case "column-headers":  return COLUMN_HEADER_HEIGHT;
    case "applicant-row":   return ROW_HEIGHT;
    case "add-item-row":    return ADD_ITEM_HEIGHT;
    case "empty-row":       return EMPTY_ROW_HEIGHT;
    case "group-spacer":    return GROUP_SPACER_HEIGHT;
    case "add-group-button": return ADD_GROUP_HEIGHT;
    case "no-results":      return NO_RESULTS_HEIGHT;
    case "orphaned-header": return ORPHANED_HEADER_HEIGHT;
    case "orphaned-row":    return ROW_HEIGHT;
  }
}

// ── Grid template builder ─────────────────────────────────────────────────────

export function buildGridTemplate(
  columns: BoardColumn[],
  collapsedColIds: Set<string>,
  columnWidths: Record<string, number>,
): string {
  const parts = [
    `${STICKY_COL_WIDTH}px`,
    ...columns.map((col) =>
      collapsedColIds.has(col.id)
        ? "32px"
        : `${columnWidths[col.id] ?? getDefaultWidth(col.type)}px`
    ),
    `${ADD_COL_BTN_WIDTH}px`,
  ];
  return parts.join(" ");
}

export function buildGridTotalWidth(
  columns: BoardColumn[],
  collapsedColIds: Set<string>,
  columnWidths: Record<string, number>,
): number {
  return (
    STICKY_COL_WIDTH +
    columns.reduce(
      (sum, col) =>
        sum +
        (collapsedColIds.has(col.id) ? 32 : (columnWidths[col.id] ?? getDefaultWidth(col.type))),
      0
    ) +
    ADD_COL_BTN_WIDTH
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseVirtualBoardOptions {
  localGroups: Group[];
  localColumns: BoardColumn[];
  sortedApplicantsByGroup: Map<string, ApplicantRow[]>;
  applicantsByGroup: Map<string, ApplicantRow[]>;
  searchQuery: string;
  activeFilters: any[];
  columnWidths: Record<string, number>;
  /** Group ID currently being dragged in (row drag — bypass virtualization for this group) */
  draggingInGroupId: string | null;
}

export function useVirtualBoard({
  localGroups,
  localColumns,
  sortedApplicantsByGroup,
  applicantsByGroup,
  searchQuery,
  activeFilters,
  columnWidths,
  draggingInGroupId,
}: UseVirtualBoardOptions) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Build flat item list ────────────────────────────────────────────────────
  const flatItems = useMemo(() => {
    const items: VirtualItem[] = [];
    const isFiltering = !!searchQuery || activeFilters.length > 0;

    for (const g of localGroups) {
      const rows = sortedApplicantsByGroup.get(g.id) ?? [];
      if (isFiltering && rows.length === 0) continue;

      // Per-group visible columns (respecting hidden_columns)
      const groupHidden = new Set<string>(g.settings?.hidden_columns ?? []);
      const groupVisibleCols = localColumns.filter((col) => !groupHidden.has(col.id));
      const colSpan = groupVisibleCols.length + 2; // sticky + columns + add-col

      items.push({
        kind: "group-header",
        groupId: g.id,
        group: g,
        rowCount: rows.length,
      });

      if (!g.is_collapsed) {
        items.push({
          kind: "column-headers",
          groupId: g.id,
          group: g,
          columns: groupVisibleCols,
        });

        if (rows.length === 0) {
          items.push({ kind: "empty-row", groupId: g.id, colSpan });
        } else {
          for (const applicant of rows) {
            items.push({ kind: "applicant-row", groupId: g.id, applicant });
          }
        }

        items.push({ kind: "add-item-row", groupId: g.id });
      }

      items.push({ kind: "group-spacer" });
    }

    // Orphaned applicants
    const orphanedRows = applicantsByGroup.get("__orphaned__") ?? [];
    if (orphanedRows.length > 0) {
      items.push({ kind: "orphaned-header", rowCount: orphanedRows.length });
      for (const applicant of orphanedRows) {
        items.push({ kind: "orphaned-row", applicant });
      }
      items.push({ kind: "group-spacer" });
    }

    // "No results" placeholder
    if (
      isFiltering &&
      localGroups.every(
        (g) => (sortedApplicantsByGroup.get(g.id) ?? []).length === 0
      ) &&
      orphanedRows.length === 0
    ) {
      items.push({ kind: "no-results" });
    }

    items.push({ kind: "add-group-button" });

    return items;
  }, [
    localGroups,
    localColumns,
    sortedApplicantsByGroup,
    applicantsByGroup,
    searchQuery,
    activeFilters,
  ]);

  // ── Per-group grid template ────────────────────────────────────────────────
  const gridTemplateByGroup = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of localGroups) {
      const hidden = new Set<string>(g.settings?.hidden_columns ?? []);
      const collapsed = new Set<string>(g.settings?.collapsed_columns ?? []);
      const groupCols = localColumns.filter((c) => !hidden.has(c.id));
      map.set(g.id, buildGridTemplate(groupCols, collapsed, columnWidths));
    }
    return map;
  }, [localGroups, localColumns, columnWidths]);

  const gridWidthByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of localGroups) {
      const hidden = new Set<string>(g.settings?.hidden_columns ?? []);
      const collapsed = new Set<string>(g.settings?.collapsed_columns ?? []);
      const groupCols = localColumns.filter((c) => !hidden.has(c.id));
      map.set(g.id, buildGridTotalWidth(groupCols, collapsed, columnWidths));
    }
    return map;
  }, [localGroups, localColumns, columnWidths]);

  // Track the active (sticky) group-header index via a ref so the render loop
  // can read it without re-triggering the virtualizer. Updated inside rangeExtractor.
  const activeGroupHeaderIdxRef = useRef(-1);

  // ── Virtualizer ────────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => estimateSize(flatItems[index]),
    overscan: 20,
    paddingStart: 12,
    paddingEnd: 28,
    // Always keep the active group header + force all rows for the dragging group
    rangeExtractor: (range) => {
      const defaultRange = defaultRangeExtractor(range);
      // Find the group header that should be "stuck" (last group-header before startIndex)
      let activeGroupHeaderIdx = -1;
      for (let i = range.startIndex; i >= 0; i--) {
        if (flatItems[i]?.kind === "group-header") {
          activeGroupHeaderIdx = i;
          break;
        }
      }
      activeGroupHeaderIdxRef.current = activeGroupHeaderIdx;
      let result = defaultRange;
      if (activeGroupHeaderIdx >= 0 && !result.includes(activeGroupHeaderIdx)) {
        result = [activeGroupHeaderIdx, ...result];
      }
      // Also keep the column-headers row (always immediately after the group-header)
      const activeColHeaderIdx = activeGroupHeaderIdx + 1;
      if (
        activeGroupHeaderIdx >= 0 &&
        activeColHeaderIdx < flatItems.length &&
        flatItems[activeColHeaderIdx]?.kind === "column-headers" &&
        !result.includes(activeColHeaderIdx)
      ) {
        result = [activeColHeaderIdx, ...result];
      }
      // During row drag, force ALL items for the dragging group into the render set
      if (draggingInGroupId) {
        const extraIndices: number[] = [];
        for (let i = 0; i < flatItems.length; i++) {
          const item = flatItems[i];
          if (
            !result.includes(i) &&
            "groupId" in item &&
            (item as any).groupId === draggingInGroupId
          ) {
            extraIndices.push(i);
          }
        }
        if (extraIndices.length > 0) {
          result = [...result, ...extraIndices].sort((a, b) => a - b);
        }
      }
      return result;
    },
  });

  // ── Compute the max width across all groups for the scroll container ──────
  const maxGridWidth = useMemo(() => {
    let max = 0;
    for (const w of gridWidthByGroup.values()) {
      if (w > max) max = w;
    }
    return max;
  }, [gridWidthByGroup]);

  return {
    scrollContainerRef,
    flatItems,
    virtualizer,
    gridTemplateByGroup,
    gridWidthByGroup,
    maxGridWidth,
    activeGroupHeaderIdxRef,
  };
}
