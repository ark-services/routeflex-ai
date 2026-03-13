"use client";

import { useEffect, useMemo, useState, useTransition, useRef, useCallback } from "react";
import {
  Copy,
  Send,
  GraduationCap,
  Link2,
  ExternalLink,
  Trash2,
  Archive,
  Mail,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  archiveApplicants,
  bulkDeleteApplicants,
  bulkMoveApplicants,
  bulkUpdateStatusCells,
  bulkUpdateTextCells,
  createBoardColumn,
  createGroup,
  deleteBoardColumn,
  toggleGroupCollapse,
  updateBoardCell,
  updateBoardColumn,
  updateGroupColor,
  moveApplicant,
  deleteApplicant,
  duplicateApplicant,
  duplicateBoardColumn,
  reorderApplicants,
  reorderColumns,
  renameGroup,
  deleteGroup,
  reorderGroups,
  quickCreateApplicant,
  sendToFadv,
  updateGroupCollapsedColumns,
  updateGroupHiddenColumns,
  bulkSendEmail,
} from "./actions";
import { MassEmailDialog } from "./components/MassEmailDialog";
import { updateBoardGroupPortalSettings, updateBoardGroupPortalChecklist, updateBoardGroupPipelineVisibility } from "./portal-actions";
import type { PortalChecklistItem } from "./portal-actions";
import { DeleteConfirmationModal } from "@/components/modals/delete-confirmation-modal";
import { ArchiveDrawer } from "./components/ArchiveDrawer";
import type { BoardCell } from "@/lib/types";
import type { ActiveFilter } from "./view-actions";
import { createClient } from "@/lib/supabase/client";

import {
  type Group,
  type ApplicantRow,
  type BoardColumn,
  type StatusLabel,
  type StoredFile,
  type VirtualItem,
  STICKY_COL_WIDTH,
  ADD_COL_BTN_WIDTH,
  getDefaultWidth,
  CellRenderer,
  SortableColumnHeader,
  SortableRow,
  SortableGroupHeader,
  ApplicantDetailPanel,
  StatusLabelsEditor,
  BoardDefaultValuesModal,
  VirtualRow,
  VirtualColumnHeaders,
  useVirtualBoard,
  GROUP_HEADER_HEIGHT,
  COLUMN_HEADER_HEIGHT,
} from "./components";

const VERBOSE = false; // set to true to re-enable verbose board logs

export default function ApplicantsBoard({
  companyId,
  jobId,
  boardId,
  groups,
  applicants,
  columns,
  statusLabels,
  cells,
  searchQuery = "",
  activeFilters = [],
  hasStatusMoveAutomations = false,
  showDefaultValues = false,
  onCloseDefaultValues,
  showArchiveDrawer = false,
  onCloseArchiveDrawer,
}: {
  companyId: string;
  jobId: string;
  boardId: string;
  groups: Group[];
  applicants: ApplicantRow[];
  columns: BoardColumn[];
  statusLabels: StatusLabel[];
  cells: BoardCell[];
  searchQuery?: string;
  activeFilters?: ActiveFilter[];
  /** Only true when there's an enabled automation with trigger_key=board.status_changes_to
   *  AND a move_group action. When false, skip router.refresh() after status changes
   *  since there are no server-side group moves to pick up. */
  hasStatusMoveAutomations?: boolean;
  /** When true, the Default Values modal is open (controlled by parent). */
  showDefaultValues?: boolean;
  onCloseDefaultValues?: () => void;
  /** When true, the Archive drawer is open (controlled by parent). */
  showArchiveDrawer?: boolean;
  onCloseArchiveDrawer?: () => void;
}) {
  // CRITICAL: Log props received to debug filtering
  if (VERBOSE) console.log('[ApplicantsBoard] Component rendered with props:', {
    companyId,
    jobId,
    boardId,
    groupsCount: groups.length,
    applicantsCount: applicants.length,
    columnsCount: columns.length,
    cellsCount: cells.length,
    applicantsPreview: applicants.slice(0, 3).map(a => ({
      id: a.id,
      name: a.full_name,
      group_id: a.group_id,
    })),
    groupsPreview: groups.map(g => ({ id: g.id, name: g.name })),
  });

  const router = useRouter();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showMassEmail, setShowMassEmail] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Add column modal
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<"text" | "number" | "date" | "file" | "status" | "email" | "phone" | "location" | "fadv.package" | "fadv.location" | "fadv.facility_id" | "fadv.position_type">("text");
  const [addColumnError, setAddColumnError] = useState<string | null>(null);
  const [addAfterColumnId, setAddAfterColumnId] = useState<string | null>(null);

  // Optimistic cell overrides: key="${applicantId}::${columnId}", value=raw cell value
  // Set immediately on change; rolls back on server error; cleared when cells prop refreshes
  const [cellOverrides, setCellOverrides] = useState<Map<string, any>>(new Map());

  // Local cells mirror — starts from the server-fetched prop, updated live via Realtime
  const [localCells, setLocalCells] = useState<BoardCell[]>(() => cells);
  useEffect(() => { setLocalCells(cells); }, [cells]);

  // Realtime: apply a board_cell INSERT or UPDATE to localCells
  const applyRealtimeCell = useCallback((cell: BoardCell) => {
    setLocalCells(prev => {
      const idx = prev.findIndex(
        c => c.applicant_id === cell.applicant_id && c.column_id === cell.column_id
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = cell;
        return next;
      }
      return [...prev, cell];
    });
  }, []);

  // Keep a ref of the current applicant IDs so the realtime handler always has
  // the latest set without needing to tear down and re-create the channel.
  const applicantIdSetRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    applicantIdSetRef.current = new Set(applicants.map(a => a.id));
  }, [applicants]);

  // Realtime subscriptions for board cell updates.
  // Sets auth explicitly before subscribing so postgres_changes RLS filter
  // receives the user's JWT — without this the createBrowserClient singleton
  // may subscribe before the session is resolved from cookies, causing the
  // realtime server to receive an unauthenticated join and silently drop WAL events.
  useEffect(() => {
    const supabase = createClient();
    let pgChannel: ReturnType<typeof supabase.channel> | null = null;
    let bcChannel: ReturnType<typeof supabase.channel> | null = null;
    let applicantChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      pgChannel = supabase
        .channel(`board-cells-${boardId}`)
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'board_cells' },
          (payload: any) => {
            const cell = payload.new as BoardCell;
            if (cell && applicantIdSetRef.current.has(cell.applicant_id)) {
              applyRealtimeCell(cell);
            }
          }
        )
        .subscribe();

      bcChannel = supabase
        .channel(`board-job-${jobId}`)
        .on('broadcast', { event: 'cell-upserted' }, ({ payload }) => {
          if (payload && applicantIdSetRef.current.has(payload.applicant_id)) {
            applyRealtimeCell(payload as BoardCell);
          }
        })
        .subscribe();

      // Listen for new applicants inserted via webhook or other external sources.
      // Without this, the board only updates on manual page refresh.
      applicantChannel = supabase
        .channel(`board-applicants-${jobId}`)
        .on(
          'postgres_changes' as any,
          { event: 'INSERT', schema: 'public', table: 'applicants', filter: `job_id=eq.${jobId}` },
          (payload: any) => {
            const incoming = payload.new as ApplicantRow;
            if (!incoming?.id) return;
            applicantIdSetRef.current.add(incoming.id);
            setLocalApplicants(prev => {
              if (prev.some(a => a.id === incoming.id)) return prev;
              return [...prev, { ...incoming, jobs: null }];
            });
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (pgChannel) supabase.removeChannel(pgChannel);
      if (bcChannel) supabase.removeChannel(bcChannel);
      if (applicantChannel) supabase.removeChannel(applicantChannel);
    };
  }, [boardId, jobId, applyRealtimeCell]);

  // Applicant detail side panel
  const [detailApplicantId, setDetailApplicantId] = useState<string | null>(null);

  // Cell-level error toast (validation / server errors from updateBoardCell)
  const [cellErrorMsg, setCellErrorMsg] = useState<string | null>(null);
  const cellErrorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Status labels editor
  const [editLabelsColumnId, setEditLabelsColumnId] = useState<string | null>(null);

  // Row menu
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);

  // Hidden columns dropdown

  // Group editing state
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupValue, setEditingGroupValue] = useState("");

  // Group menu state
  const [groupMenuOpen, setGroupMenuOpen] = useState<string | null>(null);

  // Delete confirmation
  const [deleteGroupModalOpen, setDeleteGroupModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);

  // Drag state
  const [isDraggingGroup, setIsDraggingGroup] = useState(false);
  const [groupsBeforeDrag, setGroupsBeforeDrag] = useState<Group[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  // Row drag: when set, bypass virtualization for this group so dnd-kit can see all rows
  const [draggingInGroupId, setDraggingInGroupId] = useState<string | null>(null);

  // Local state for optimistic updates
  const [localColumns, setLocalColumns] = useState(columns);
  const [localApplicants, setLocalApplicants] = useState(applicants);
  const [localGroups, setLocalGroups] = useState(groups);

  // Column sort state — null means use default position order
  const [sortState, setSortState] = useState<{ columnId: string; direction: "asc" | "desc" } | null>(null);

  function handleSort(columnId: string) {
    setSortState(prev => {
      if (!prev || prev.columnId !== columnId) return { columnId, direction: "asc" };
      if (prev.direction === "asc") return { columnId, direction: "desc" };
      return null;
    });
  }

  // Frozen columns count — persisted to localStorage per job
  const [frozenColumnsCount, setFrozenColumnsCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const stored = localStorage.getItem(`frozen-cols-${jobId}`);
    return stored ? Math.max(0, parseInt(stored, 10)) : 0;
  });
  const handleFreezeColumns = useCallback((n: number) => {
    setFrozenColumnsCount(n);
    localStorage.setItem(`frozen-cols-${jobId}`, String(n));
  }, [jobId]);

  // Mobile card expanded state
  const [mobileExpandedRows, setMobileExpandedRows] = useState<Record<string, boolean>>({});

  // Avoid hydration mismatches with DnD/table markup by rendering after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update local state when props change
  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  useEffect(() => {
    setLocalApplicants(applicants);
  }, [applicants]);

  useEffect(() => {
    setLocalGroups(groups);
  }, [groups]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const col of columns) {
      init[col.id] = col.settings?.ui?.width ?? getDefaultWidth(col.type);
    }
    return init;
  });

  useEffect(() => {
    setColumnWidths(prev => {
      const next = { ...prev };
      for (const col of columns) {
        if (col.settings?.ui?.width !== undefined) {
          next[col.id] ??= col.settings.ui.width;
        } else {
          next[col.id] ??= getDefaultWidth(col.type);
        }
      }
      return next;
    });
  }, [columns]);

  function getColumnWidth(colId: string, colType: string): number {
    return columnWidths[colId] ?? getDefaultWidth(colType);
  }

  // Filter out hidden columns for display
  const visibleColumns = useMemo(() => {
    return localColumns.filter((col) => !col.is_hidden);
  }, [localColumns]);

  const totalTableWidth = useMemo(() => {
    return STICKY_COL_WIDTH
      + visibleColumns.reduce((sum, col) => sum + (columnWidths[col.id] ?? getDefaultWidth(col.type)), 0)
      + ADD_COL_BTN_WIDTH;
  }, [columnWidths, visibleColumns]);

  /** Per-group table width — collapsed columns contribute a fixed 32 px instead of their full width. */
  function getGroupTableWidth(collapsedColIds: Set<string>) {
    return STICKY_COL_WIDTH
      + visibleColumns.reduce((sum, col) =>
          sum + (collapsedColIds.has(col.id) ? 32 : (columnWidths[col.id] ?? getDefaultWidth(col.type))),
        0)
      + ADD_COL_BTN_WIDTH;
  }

  const hiddenColumns = useMemo(() => {
    return localColumns.filter((col) => col.is_hidden);
  }, [localColumns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  // Build a fast cell lookup once so filtering can reference it
  const cellLookup = useMemo(() => {
    const map = new Map<string, BoardCell>();
    for (const c of cells) {
      map.set(`${c.applicant_id}::${c.column_id}`, c);
    }
    return map;
  }, [cells]);

  // Compute FADV readiness: applicants that have all 4 FADV fields filled in board_cells
  const fadvReadyApplicantIds = useMemo(() => {
    const FADV_TYPES = ["fadv.package", "fadv.location", "fadv.facility_id", "fadv.position_type"];
    const fadvCols = localColumns.filter((c) => FADV_TYPES.includes(c.type));
    const hasAllTypes = FADV_TYPES.every((t) => fadvCols.some((c) => c.type === t));
    if (!hasAllTypes || fadvCols.length === 0) return new Set<string>();

    const ready = new Set<string>();
    for (const a of localApplicants) {
      const allFilled = fadvCols.every((col) => {
        const cell = cellLookup.get(`${a.id}::${col.id}`);
        return cell?.value_text?.trim();
      });
      if (allFilled) ready.add(a.id);
    }
    return ready;
  }, [localColumns, localApplicants, cellLookup]);

  // Build status-label lookup: labelId → label text (for filter matching)
  const statusLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const sl of statusLabels) {
      map.set(sl.id, sl.label);
    }
    return map;
  }, [statusLabels]);

  // Apply search + filters to produce filtered view (does not mutate localApplicants)
  const filteredApplicants = useMemo(() => {
    let result = localApplicants;

    // ── Search ──────────────────────────────────────────────────────────────
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((a) => {
        if (a.full_name?.toLowerCase().includes(q)) return true;
        if (a.email?.toLowerCase().includes(q)) return true;
        if (a.phone?.toLowerCase().includes(q)) return true;
        if (a.status?.toLowerCase().includes(q)) return true;
        // Search text-like cell values
        for (const col of localColumns) {
          if (["text", "email", "phone", "location", "fadv.package", "fadv.location", "fadv.facility_id", "fadv.position_type"].includes(col.type)) {
            const cell = cellLookup.get(`${a.id}::${col.id}`);
            if (cell?.value_text?.toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    // ── Column filters with AND/OR joiner support ──────────────────────────
    if (activeFilters.length > 0) {
      // Helper: evaluate a single filter clause for one applicant
      function evalClause(a: typeof result[0], f: typeof activeFilters[0]): boolean {
        const col = localColumns.find((c) => c.id === f.columnId);
        if (!col) return true; // unknown column → pass-through

        const cell = cellLookup.get(`${a.id}::${f.columnId}`);

        if (f.condition === "is_empty") {
          if (col.type === "status") return !cell?.value_status_label_id;
          if (col.type === "number") return cell?.value_number == null;
          if (col.type === "date") return !cell?.value_date;
          if (col.type === "file") return !cell?.value_file_path;
          return !cell?.value_text;
        }
        if (f.condition === "is_not_empty") {
          if (col.type === "status") return !!cell?.value_status_label_id;
          if (col.type === "number") return cell?.value_number != null;
          if (col.type === "date") return !!cell?.value_date;
          if (col.type === "file") return !!cell?.value_file_path;
          return !!cell?.value_text;
        }
        if (col.type === "status") {
          const labelId = cell?.value_status_label_id ?? "";
          if (f.condition === "is") return labelId === f.value;
          if (f.condition === "is_not") return labelId !== f.value;
          return true;
        }
        if (col.type === "number") {
          const num = cell?.value_number ?? null;
          const fv = parseFloat(f.value);
          if (isNaN(fv) || num == null) return false;
          if (f.condition === "equals") return num === fv;
          if (f.condition === "greater_than") return num > fv;
          if (f.condition === "less_than") return num < fv;
          return true;
        }
        if (col.type === "date") {
          const dv = cell?.value_date ?? "";
          if (!dv || !f.value) return false;
          if (f.condition === "is") return dv === f.value;
          if (f.condition === "before") return dv < f.value;
          if (f.condition === "after") return dv > f.value;
          return true;
        }
        // Text-like
        const tv = (cell?.value_text ?? "").toLowerCase();
        const fvl = f.value.toLowerCase();
        if (f.condition === "contains") return tv.includes(fvl);
        if (f.condition === "equals") return tv === fvl;
        return true;
      }

      // Combine filter clauses left-to-right using each row's joiner.
      // Row 0 always applies. Row i uses f.joiner ("and"|"or", default "and").
      result = result.filter((a) => {
        let pass = evalClause(a, activeFilters[0]);
        for (let i = 1; i < activeFilters.length; i++) {
          const joiner = activeFilters[i].joiner ?? "and";
          const next = evalClause(a, activeFilters[i]);
          pass = joiner === "or" ? pass || next : pass && next;
        }
        return pass;
      });
    }

    return result;
  }, [localApplicants, searchQuery, activeFilters, localColumns, cellLookup, statusLabelById]);

  const applicantsByGroup = useMemo(() => {
    if (VERBOSE) console.log('[ApplicantsBoard] Starting grouping with:', {
      totalApplicants: filteredApplicants.length,
      totalGroups: groups.length,
      applicants: filteredApplicants.map(a => ({
        id: a.id,
        name: a.full_name,
        group_id: a.group_id,
      })),
      groups: groups.map(g => ({ id: g.id, name: g.name })),
    });

    const map = new Map<string, ApplicantRow[]>();

    // Initialize map with all groups
    for (const g of groups) {
      map.set(g.id, []);
    }

    // CRITICAL: Group ALL applicants, never drop any
    // If group_id doesn't match any group, put in orphaned section
    const orphanedApplicants: ApplicantRow[] = [];

    for (const a of filteredApplicants) {
      // If no group_id or group doesn't exist, put in orphaned
      if (!a.group_id || !map.has(a.group_id)) {
        console.warn('[ApplicantsBoard] Orphaned applicant (no matching group):', {
          id: a.id,
          name: a.full_name,
          group_id: a.group_id,
          reason: !a.group_id ? 'NULL group_id' : 'group_id not in groups list',
        });
        orphanedApplicants.push(a);
      } else {
        // Normal case: group_id matches a known group
        map.get(a.group_id)!.push(a);
      }
    }

    // Add orphaned applicants to synthetic group
    if (orphanedApplicants.length > 0) {
      map.set('__orphaned__', orphanedApplicants);
      console.error(
        `[ApplicantsBoard] ${orphanedApplicants.length} orphaned applicants will render in '⚠️ Orphaned Applicants' section`
      );
    }

    // Sort all groups by position
    for (const rows of map.values()) {
      rows.sort((a, b) => a.position - b.position);
    }

    // Final count
    const totalGrouped = Array.from(map.values()).reduce((sum, rows) => sum + rows.length, 0);
    if (VERBOSE) console.log('[ApplicantsBoard] Grouping complete:', {
      inputApplicants: filteredApplicants.length,
      outputApplicants: totalGrouped,
    });

    return map;
  }, [groups, filteredApplicants]);

  const cellsByApplicantAndColumn = useMemo(() => {
    const map = new Map<string, BoardCell>();
    for (const c of localCells) {
      map.set(`${c.applicant_id}::${c.column_id}`, c);
    }
    return map;
  }, [localCells]);

  const labelsByColumn = useMemo(() => {
    const map = new Map<string, StatusLabel[]>();
    for (const label of statusLabels) {
      if (!map.has(label.column_id)) map.set(label.column_id, []);
      map.get(label.column_id)!.push(label);
    }
    return map;
  }, [statusLabels]);

  // Sorted view of applicantsByGroup — applies column sort within each group
  const sortedApplicantsByGroup = useMemo(() => {
    if (!sortState) return applicantsByGroup;
    const col = localColumns.find(c => c.id === sortState.columnId);
    if (!col || col.type === "file") return applicantsByGroup;

    function getSortValue(a: ApplicantRow): string | number | boolean | null {
      if (col!.is_system) {
        if (col!.name === "Name") return a.full_name ?? null;
        if (col!.name === "Email") return a.email ?? null;
        if (col!.name === "Phone") return a.phone ?? null;
        return null;
      }
      const overrideKey = `${a.id}::${col!.id}`;
      const cell = cellOverrides.has(overrideKey)
        ? undefined // use override below
        : cellsByApplicantAndColumn.get(`${a.id}::${col!.id}`);

      if (cellOverrides.has(overrideKey)) return cellOverrides.get(overrideKey) ?? null;
      if (!cell) return null;

      if (col!.type === "number") return cell.value_number ?? null;
      if (col!.type === "date") return cell.value_date ?? null;
      if (col!.type === "checkbox") return cell.value_bool ?? null;
      if (col!.type === "status") {
        const labelId = cell.value_status_label_id;
        if (!labelId) return null;
        const label = labelsByColumn.get(col!.id)?.find(l => l.id === labelId);
        return label?.label ?? null;
      }
      // text, email, phone, location, fadv.*
      return cell.value_text ?? null;
    }

    const dir = sortState.direction === "asc" ? 1 : -1;
    const sorted = new Map<string, ApplicantRow[]>();
    for (const [groupId, rows] of applicantsByGroup.entries()) {
      sorted.set(groupId, [...rows].sort((a, b) => {
        const aVal = getSortValue(a);
        const bVal = getSortValue(b);
        // Nulls always last regardless of direction
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
        if (typeof aVal === "boolean" && typeof bVal === "boolean") return ((aVal ? 1 : 0) - (bVal ? 1 : 0)) * dir;
        return String(aVal).localeCompare(String(bVal), undefined, { sensitivity: "base" }) * dir;
      }));
    }
    return sorted;
  }, [sortState, applicantsByGroup, localColumns, cellsByApplicantAndColumn, cellOverrides, labelsByColumn]);

  // ── Virtual board hook ──────────────────────────────────────────────────────
  const {
    scrollContainerRef,
    flatItems,
    virtualizer,
    gridTemplateByGroup,
    gridWidthByGroup,
    maxGridWidth,
    activeGroupHeaderIdxRef,
  } = useVirtualBoard({
    localGroups,
    localColumns: localColumns.filter((col) => !col.is_hidden),
    sortedApplicantsByGroup,
    applicantsByGroup,
    searchQuery,
    activeFilters,
    columnWidths,
    draggingInGroupId,
  });

  // ── Sticky header scroll handler ─────────────────────────────────────────
  // Uses CSS custom property --y to decouple from React's transform ownership.
  // React sets: transform: translateY(var(--y, {vi.start}px))
  // Scroll handler sets: --y: {clampedValue}px  (on sticky items only)
  // When --y is set, it overrides the fallback. When removed, the fallback
  // (vi.start) kicks in. React never touches --y, so no jitter on re-render.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const applySticky = () => {
      const scrollTop = container.scrollTop;
      const ghEls = container.querySelectorAll<HTMLElement>(
        '[data-kind="group-header"]'
      );
      const chEls = container.querySelectorAll<HTMLElement>(
        '[data-kind="column-headers"]'
      );

      // Clear ALL --y overrides first — prevents stale overrides when the
      // active group changes or when the useEffect re-runs with a new closure.
      for (const el of ghEls) {
        el.style.removeProperty("--y");
        el.style.zIndex = "";
      }
      for (const el of chEls) {
        el.style.removeProperty("--y");
        el.style.zIndex = "";
      }

      // Find the active group-header (last one whose vstart ≤ scrollTop)
      let activeGH: HTMLElement | null = null;
      let ghStart = 0;
      let nextGHStart = Infinity;
      for (let i = 0; i < ghEls.length; i++) {
        const s = parseFloat(ghEls[i].getAttribute("data-vstart") || "0");
        if (s <= scrollTop) {
          activeGH = ghEls[i];
          ghStart = s;
          nextGHStart =
            i + 1 < ghEls.length
              ? parseFloat(ghEls[i + 1].getAttribute("data-vstart") || "0")
              : Infinity;
        }
      }

      if (!activeGH) return;

      // Clamp group-header Y: stick at scrollTop, push off when next group arrives
      const stickyHeight = GROUP_HEADER_HEIGHT + COLUMN_HEADER_HEIGHT; // group-header + column-headers
      const ghUpperBound = nextGHStart - stickyHeight;
      const ghY = Math.min(Math.max(ghStart, scrollTop), ghUpperBound);
      activeGH.style.setProperty("--y", `${ghY}px`);
      activeGH.style.zIndex = "15";

      // Clamp column-headers Y
      const activeIdx = activeGH.getAttribute("data-index");
      const chIdx = String(Number(activeIdx) + 1);
      const chEl = container.querySelector<HTMLElement>(
        `[data-index="${chIdx}"][data-kind="column-headers"]`
      );
      if (chEl) {
        const chStart = parseFloat(chEl.getAttribute("data-vstart") || "0");
        const chUpperBound = nextGHStart - COLUMN_HEADER_HEIGHT;
        const chY = Math.min(
          Math.max(chStart, scrollTop + GROUP_HEADER_HEIGHT),
          chUpperBound
        );
        chEl.style.setProperty("--y", `${chY}px`);
        chEl.style.zIndex = "14";
      }
    };

    container.addEventListener("scroll", applySticky, { passive: true });
    applySticky();
    return () => container.removeEventListener("scroll", applySticky);
  }, [flatItems, scrollContainerRef]);

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    setActiveDragId(active.id.toString());

    // Detect group dragging and collapse groups
    if (active.id.toString().startsWith("group-")) {
      setIsDraggingGroup(true);
      setGroupsBeforeDrag(localGroups);

      // Collapse all groups optimistically (no server round-trips) so the drag
      // list is compact and the overlay can render immediately.
      setLocalGroups((prev) => prev.map((g) => ({ ...g, is_collapsed: true })));
    }

    // Detect row dragging — bypass virtualization for this group so dnd-kit can see all rows
    if (active.id.toString().startsWith("row-")) {
      const rowId = active.id.toString().replace("row-", "");
      const row = localApplicants.find((a) => a.id === rowId);
      if (row?.group_id) {
        setDraggingInGroupId(row.group_id);
      }
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Live-reorder groups while dragging
    if (active.id.toString().startsWith("group-") && over.id.toString().startsWith("group-")) {
      const oldIndex = localGroups.findIndex((g) => `group-${g.id}` === active.id);
      const newIndex = localGroups.findIndex((g) => `group-${g.id}` === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setLocalGroups(arrayMove(localGroups, oldIndex, newIndex));
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    // Always clear drag overlay + row drag bypass
    setActiveDragId(null);
    setDraggingInGroupId(null);

    // Handle group reordering before the early-return check. With live
    // onDragOver reordering, active.id === over.id is expected when the item
    // has already been moved to its target slot — that is a valid drop, not a
    // no-op. Only revert if there's no over target at all (true cancel).
    if (active.id.toString().startsWith("group-")) {
      if (!over) {
        // No drop target — revert to original order
        setLocalGroups(groupsBeforeDrag);
      } else {
        // localGroups already has the correct order from onDragOver; restore collapse state and persist
        const collapseById = new Map(groupsBeforeDrag.map((g) => [g.id, g.is_collapsed]));
        const finalOrder = localGroups.map((g) => ({
          ...g,
          is_collapsed: collapseById.get(g.id) ?? g.is_collapsed,
        }));
        setLocalGroups(finalOrder);

        startTransition(async () => {
          await reorderGroups(companyId, jobId, boardId, finalOrder.map((g) => g.id));
          for (const beforeGroup of groupsBeforeDrag) {
            if (!beforeGroup.is_collapsed) {
              await toggleGroupCollapse(companyId, jobId, boardId, beforeGroup.id, false);
            }
          }
        });
      }

      setIsDraggingGroup(false);
      return;
    }

    if (!over || active.id === over.id) return;

    // Handle column reordering
    if (active.id.toString().startsWith("col-")) {
      const oldIndex = localColumns.findIndex((c) => `col-${c.id}` === active.id);
      const newIndex = localColumns.findIndex((c) => `col-${c.id}` === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(localColumns, oldIndex, newIndex);
        setLocalColumns(newOrder);

        // Persist to DB
        startTransition(async () => {
          for (let i = 0; i < newOrder.length; i++) {
            await reorderColumns(companyId, jobId, newOrder[i].id, i);
          }
        });
      }
    }

    // Handle row reordering
    if (active.id.toString().startsWith("row-")) {
      const activeRowId = active.id.toString().replace("row-", "");
      const overRowId = over.id.toString().replace("row-", "");

      const activeRow = localApplicants.find((a) => a.id === activeRowId);
      const overRow = localApplicants.find((a) => a.id === overRowId);

      if (activeRow && overRow && activeRow.group_id === overRow.group_id) {
        const groupRows = localApplicants.filter((a) => a.group_id === activeRow.group_id);
        const oldIndex = groupRows.findIndex((a) => a.id === activeRowId);
        const newIndex = groupRows.findIndex((a) => a.id === overRowId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(groupRows, oldIndex, newIndex);

          // Update local state optimistically
          const updatedApplicants = localApplicants.map((a) => {
            if (a.group_id !== activeRow.group_id) return a;
            const idx = newOrder.findIndex((r) => r.id === a.id);
            return { ...a, position: idx };
          });
          setLocalApplicants(updatedApplicants);

          // Persist to DB
          startTransition(async () => {
            await reorderApplicants(companyId, jobId, activeRowId, newIndex, activeRow.group_id);
          });
        }
      }
    }
  }

  function handleDragCancel() {
    // Clear drag overlay + row drag bypass
    setActiveDragId(null);
    setDraggingInGroupId(null);

    // Restore pre-drag collapse state optimistically, then sync to server
    if (isDraggingGroup) {
      setIsDraggingGroup(false);
      setLocalGroups(groupsBeforeDrag);

      startTransition(async () => {
        for (const beforeGroup of groupsBeforeDrag) {
          if (!beforeGroup.is_collapsed) {
            await toggleGroupCollapse(companyId, jobId, boardId, beforeGroup.id, false);
          }
        }
      });
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllInGroup(groupId: string, rows: ApplicantRow[]) {
    const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);
    setSelected((prev) => {
      const next = { ...prev };
      for (const r of rows) next[r.id] = !allSelected;
      return next;
    });
  }

  function clearSelection() {
    setSelected({});
  }

  async function onBulkDelete() {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      title: "Delete Applicants",
      description: `This will permanently delete ${selectedIds.length} applicant(s). This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    startTransition(async () => {
      await bulkDeleteApplicants(companyId, jobId, selectedIds);
      clearSelection();
    });
  }

  function onMoveToGroup(groupId: string) {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      await bulkMoveApplicants(companyId, jobId, selectedIds, groupId);
      // Keep selection after bulk move so user can perform multiple actions
    });
  }

  function handleAddNewGroup() {
    // Pick the first unused "New Group / New Group 2 / …" name client-side.
    // The server retry loop is the authoritative collision handler for concurrency;
    // this just avoids the extra round-trips in the common single-user case.
    const existingNames = new Set(localGroups.map((g) => g.name));
    let candidateName = "New Group";
    let suffix = 2;
    while (existingNames.has(candidateName)) {
      candidateName = `New Group ${suffix}`;
      suffix++;
    }

    startTransition(async () => {
      const result = await createGroup(companyId, jobId, boardId, candidateName);
      if (result?.data) {
        const newGroup: Group = { ...result.data, is_collapsed: false };
        setLocalGroups((prev) => [...prev, newGroup]);
        setEditingGroupId(newGroup.id);
        setEditingGroupValue(newGroup.name);
      }
    });
  }

  function onToggleGroupCollapse(groupId: string, currentCollapsed: boolean) {
    startTransition(async () => {
      await toggleGroupCollapse(companyId, jobId, boardId, groupId, !currentCollapsed);
    });
  }

  function onUpdateGroupColor(groupId: string, color: string) {
    // Optimistic update so the border/text color changes immediately
    setLocalGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, color } : g))
    );
    startTransition(async () => {
      await updateGroupColor(companyId, jobId, boardId, groupId, color);
    });
  }

  function onRenameGroup(groupId: string) {
    const name = editingGroupValue.trim();
    if (!name) return;

    startTransition(async () => {
      await renameGroup(companyId, jobId, boardId, groupId, name);
      setEditingGroupId(null);
      setEditingGroupValue("");
    });
  }

  function onDeleteGroup() {
    if (!groupToDelete) return;

    startTransition(async () => {
      const result = await deleteGroup(companyId, jobId, boardId, groupToDelete.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setDeleteGroupModalOpen(false);
      setGroupToDelete(null);
    });
  }

  function onAddColumn() {
    const name = newColumnName.trim();
    if (!name) return;

    setAddColumnError(null);

    startTransition(async () => {
      const result = await createBoardColumn(
        companyId,
        jobId,
        name,
        newColumnType,
        addAfterColumnId || undefined
      );

      if (!result.success) {
        setAddColumnError(result.error || "Failed to create column");
        return;
      }

      setShowAddColumnModal(false);
      setNewColumnName("");
      setNewColumnType("text");
      setAddColumnError(null);
      setAddAfterColumnId(null);
    });
  }

  function onSaveColumnName(columnId: string, newName: string) {
    startTransition(async () => {
      await updateBoardColumn(companyId, jobId, columnId, { name: newName });
    });
  }

  async function onDeleteColumn(columnId: string) {
    const ok = await confirm({
      title: "Delete Column",
      description: "All data in this column will be permanently lost.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    startTransition(async () => {
      await deleteBoardColumn(companyId, jobId, columnId);
    });
  }

  function onToggleMinimizeColumn(columnId: string, groupId: string) {
    const group = localGroups.find((g) => g.id === groupId);
    if (!group) return;

    const current: string[] = group.settings?.collapsed_columns ?? [];
    const isCollapsed = current.includes(columnId);
    const next = isCollapsed
      ? current.filter((id) => id !== columnId)
      : [...current, columnId];

    // Optimistic update
    setLocalGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, settings: { ...g.settings, collapsed_columns: next } }
          : g
      )
    );

    startTransition(async () => {
      await updateGroupCollapsedColumns(companyId, jobId, boardId, groupId, next);
    });
  }

  function onMinimizeAllColumns(groupId: string) {
    const group = localGroups.find((g) => g.id === groupId);
    const groupHidden = new Set<string>(group?.settings?.hidden_columns ?? []);
    const allColumnIds = localColumns.filter((c) => !groupHidden.has(c.id)).map((c) => c.id);
    setLocalGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, settings: { ...g.settings, collapsed_columns: allColumnIds } }
          : g
      )
    );
    startTransition(async () => {
      await updateGroupCollapsedColumns(companyId, jobId, boardId, groupId, allColumnIds);
    });
  }

  function onExpandAllColumns(groupId: string) {
    setLocalGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, settings: { ...g.settings, collapsed_columns: [] } }
          : g
      )
    );
    startTransition(async () => {
      await updateGroupCollapsedColumns(companyId, jobId, boardId, groupId, []);
    });
  }

  function onUpdateGroupPortalVisibility(groupId: string, visible: boolean) {
    setLocalGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, visible_to_applicants: visible } : g))
    );
    startTransition(async () => {
      await updateBoardGroupPortalSettings(companyId, groupId, { visible_to_applicants: visible });
    });
  }

  function onUpdateGroupPortalNote(groupId: string, note: string) {
    setLocalGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, applicant_note: note } : g))
    );
    startTransition(async () => {
      await updateBoardGroupPortalSettings(companyId, groupId, { applicant_note: note });
    });
  }

  function onUpdateGroupPortalChecklist(groupId: string, checklist: PortalChecklistItem[]) {
    setLocalGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, settings: { ...g.settings, portal_checklist: checklist } }
          : g
      )
    );
    startTransition(async () => {
      await updateBoardGroupPortalChecklist(companyId, groupId, checklist);
    });
  }

  function onUpdateGroupPipelineVisibility(groupId: string, show: boolean) {
    setLocalGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, show_in_pipeline: show } : g))
    );
    startTransition(async () => {
      await updateBoardGroupPipelineVisibility(companyId, groupId, show);
    });
  }

  function onColumnWidthChange(columnId: string, width: number) {
    setColumnWidths(prev => ({ ...prev, [columnId]: width }));
  }

  function onColumnWidthCommit(columnId: string, width: number) {
    setColumnWidths(prev => ({ ...prev, [columnId]: width }));
    const column = localColumns.find(c => c.id === columnId);
    if (!column) return;
    const newSettings = {
      ...column.settings,
      ui: { ...column.settings?.ui, width },
    };
    startTransition(async () => {
      await updateBoardColumn(companyId, jobId, columnId, { settings: newSettings });
    });
  }

  function onColumnWidthReset(columnId: string, colType: string) {
    const def = getDefaultWidth(colType);
    onColumnWidthCommit(columnId, def);
  }

  function onShowColumnInGroup(columnId: string, groupId: string) {
    const group = localGroups.find((g) => g.id === groupId);
    if (!group) return;
    const next = (group.settings?.hidden_columns ?? []).filter((id) => id !== columnId);
    setLocalGroups((prev) => prev.map((g) =>
      g.id === groupId ? { ...g, settings: { ...g.settings, hidden_columns: next } } : g
    ));
    startTransition(async () => {
      await updateGroupHiddenColumns(companyId, jobId, boardId, groupId, next);
    });
  }

  function onHideColumnInGroup(columnId: string, groupId: string) {
    const group = localGroups.find((g) => g.id === groupId);
    if (!group) return;
    const current = group.settings?.hidden_columns ?? [];
    if (current.includes(columnId)) return;
    const next = [...current, columnId];
    setLocalGroups((prev) => prev.map((g) =>
      g.id === groupId ? { ...g, settings: { ...g.settings, hidden_columns: next } } : g
    ));
    startTransition(async () => {
      await updateGroupHiddenColumns(companyId, jobId, boardId, groupId, next);
    });
  }

  function onAddColumnRight(afterColumnId: string) {
    setAddAfterColumnId(afterColumnId);
    setShowAddColumnModal(true);
  }

  function onDuplicateColumn(columnId: string, withValues: boolean) {
    startTransition(async () => {
      await duplicateBoardColumn(companyId, jobId, columnId, withValues);
    });
  }

  function onMoveApplicant(applicantId: string, groupId: string) {
    // Optimistically update group_id before the server action completes
    const snapshot = localApplicants;
    setLocalApplicants(cur =>
      cur.map(a => a.id === applicantId ? { ...a, group_id: groupId } : a)
    );
    setRowMenuOpen(null);
    startTransition(async () => {
      try {
        await moveApplicant(companyId, jobId, applicantId, groupId);
      } catch (error) {
        // Revert optimistic update on failure
        setLocalApplicants(snapshot);
        console.error("[onMoveApplicant] Error:", error);
        toast.error("Failed to move applicant. Please try again.");
      }
    });
  }

  async function onArchiveApplicant(applicantId: string) {
    startTransition(async () => {
      await archiveApplicants(companyId, jobId, [applicantId]);
      setRowMenuOpen(null);
    });
  }

  async function onBulkArchive() {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      title: "Archive Applicants",
      description: `This will archive ${selectedIds.length} applicant${selectedIds.length !== 1 ? "s" : ""}. They can be restored later from the archive.`,
      confirmLabel: "Archive",
    });
    if (!ok) return;

    startTransition(async () => {
      await archiveApplicants(companyId, jobId, selectedIds);
      clearSelection();
    });
  }

  async function onDeleteApplicant(applicantId: string) {
    const ok = await confirm({
      title: "Delete Applicant",
      description: "This will permanently remove this applicant and all their data. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    startTransition(async () => {
      await deleteApplicant(companyId, jobId, applicantId);
      setRowMenuOpen(null);
    });
  }

  function onDuplicateApplicant(applicantId: string) {
    startTransition(async () => {
      await duplicateApplicant(companyId, jobId, applicantId);
      setRowMenuOpen(null);
    });
  }

  function getCellValue(applicant: ApplicantRow, column: BoardColumn) {
    if (column.is_system) {
      if (column.name === "Name") return applicant.full_name;
      if (column.name === "Email") return applicant.email;
      if (column.name === "Phone") return applicant.phone;
      if (column.name === "Status") return applicant.status;
      return null;
    }

    // Check optimistic overrides first — applied immediately on user change before server confirms
    const overrideKey = `${applicant.id}::${column.id}`;
    if (cellOverrides.has(overrideKey)) return cellOverrides.get(overrideKey);

    const cell = cellsByApplicantAndColumn.get(`${applicant.id}::${column.id}`);
    if (!cell) {
      // Fallback for applicants created externally (e.g. webhook) that have no board_cells yet.
      if (column.type === "email") return applicant.email || null;
      if (column.type === "phone") return applicant.phone || null;
      return null;
    }

    if (column.type === "text") return cell.value_text;
    if (column.type === "number") return cell.value_number;
    if (column.type === "date") return cell.value_date;
    if (column.type === "status") return cell.value_status_label_id;
    if (column.type === "checkbox") return cell.value_bool ?? false;
    if (column.type === "email") return cell.value_text;
    if (column.type === "phone") return cell.value_text;
    if (column.type === "location") return cell.value_text;
    if (column.type === "fadv.package") return cell.value_text;
    if (column.type === "fadv.location") return cell.value_text;
    if (column.type === "fadv.facility_id") return cell.value_text;
    if (column.type === "fadv.position_type") return cell.value_text;
    if (column.type === "file") {
      if (!cell.value_file_path && !cell.value_text) return null;
      if (cell.value_text) {
        try {
          const parsed = JSON.parse(cell.value_text);
          if (Array.isArray(parsed)) return parsed as StoredFile[];
          // Old format: { name, size, type } metadata object — wrap into array
          if (parsed && typeof parsed === "object" && "name" in parsed) {
            return [{
              id: cell.value_file_path || parsed.name,
              name: parsed.name,
              path: cell.value_file_path || "",
              bucket: "files",
              type: parsed.type || "",
              size: parsed.size || 0,
              createdAt: new Date().toISOString(),
            }] as StoredFile[];
          }
        } catch {}
      }
      // Bare path only (no metadata) — synthesize a minimal StoredFile.
      // Board file-cell uploads always persist full JSON in value_text, so this
      // branch is only reached for application-form uploads (→ "resumes" bucket).
      // Infer MIME type from the file extension so the viewer can show a preview.
      if (cell.value_file_path) {
        const name = cell.value_file_path.split("/").pop() || "File";
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        const MIME_MAP: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
          gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif",
          pdf: "application/pdf",
          doc: "application/msword",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
        return [{
          id: cell.value_file_path,
          name,
          path: cell.value_file_path,
          bucket: "resumes",
          type: MIME_MAP[ext] ?? "",
          size: 0,
          createdAt: new Date().toISOString(),
        }] as StoredFile[];
      }
      return null;
    }
    return null;
  }

  function showCellError(msg: string) {
    if (cellErrorTimeout.current) clearTimeout(cellErrorTimeout.current);
    setCellErrorMsg(msg);
    cellErrorTimeout.current = setTimeout(() => setCellErrorMsg(null), 5000);
  }

  function onQuickCreateApplicant(groupId: string) {
    startTransition(async () => {
      try {
        const result = await quickCreateApplicant(companyId, jobId, groupId, boardId);
        // Append new row to local state — no RSC refetch needed.
        // Dedup by id: the realtime subscription may have already added this
        // row if the postgres_changes event arrived before this callback ran.
        if (result) {
          const { applicant: newApplicant, defaultCells } = result;
          applicantIdSetRef.current.add(newApplicant.id);
          setLocalApplicants(prev => {
            if (prev.some(a => a.id === newApplicant.id)) return prev;
            return [...prev, newApplicant];
          });
          // Apply default column values immediately so they show without a refresh
          if (defaultCells.length > 0) {
            setCellOverrides(prev => {
              const next = new Map(prev);
              for (const c of defaultCells) {
                next.set(`${newApplicant.id}::${c.columnId}`, c.value);
              }
              return next;
            });
          }
        }
      } catch (error) {
        console.error("[onQuickCreateApplicant] Error:", error);
        toast.error("Failed to create applicant. Please try again.");
      }
    });
  }

  function onUpdateCell(applicantId: string, columnId: string, columnType: "text" | "number" | "date" | "status" | "checkbox" | "email" | "phone" | "location" | "file" | "fadv.package" | "fadv.location" | "fadv.facility_id" | "fadv.position_type", value: any) {
    const isBulk = columnType !== "file" && selectedIds.length > 1 && selected[applicantId];

    // BULK STATUS UPDATE: If this is a status column AND multiple rows are selected AND this row is selected,
    // update all selected rows with the new status value
    if (isBulk && columnType === "status") {
      if (VERBOSE) console.log('[onUpdateCell] Bulk status update triggered:', {
        applicantId, columnId, statusLabelId: value, selectedCount: selectedIds.length, selectedIds,
      });

      // Optimistically update all selected rows immediately
      setCellOverrides(prev => {
        const next = new Map(prev);
        for (const id of selectedIds) next.set(`${id}::${columnId}`, value);
        return next;
      });

      startTransition(async () => {
        try {
          const result = await bulkUpdateStatusCells(companyId, jobId, selectedIds, columnId, value);
          if (VERBOSE) console.log('[onUpdateCell] Bulk update result:', result);
          if (result.failed > 0) {
            // Partial failure — roll back all overrides for this column
            setCellOverrides(prev => {
              const next = new Map(prev);
              for (const id of selectedIds) next.delete(`${id}::${columnId}`);
              return next;
            });
            toast.warning(`Updated ${result.successful} of ${selectedIds.length} applicants. ${result.failed} failed.`);
          } else if (hasStatusMoveAutomations) {
            // Only refresh if there's an enabled move_group automation that may
            // have repositioned applicants in the after() callback.
            setTimeout(() => router.refresh(), 1500);
          }
        } catch (error) {
          console.error('[onUpdateCell] Bulk update failed:', error);
          setCellOverrides(prev => {
            const next = new Map(prev);
            for (const id of selectedIds) next.delete(`${id}::${columnId}`);
            return next;
          });
          toast.error('Failed to update selected applicants. Please try again.');
        }
      });
    } else if (isBulk) {
      // BULK NON-STATUS UPDATE: text, number, date, checkbox, email, phone, location, fadv.*
      // Optimistically apply to all selected rows immediately
      setCellOverrides(prev => {
        const next = new Map(prev);
        for (const id of selectedIds) next.set(`${id}::${columnId}`, value);
        return next;
      });

      startTransition(async () => {
        try {
          const result = await bulkUpdateTextCells(companyId, jobId, selectedIds, columnId, columnType as any, value);
          if (result.failed > 0) {
            // Roll back all overrides for this column
            setCellOverrides(prev => {
              const next = new Map(prev);
              for (const id of selectedIds) next.delete(`${id}::${columnId}`);
              return next;
            });
            toast.warning(`Updated ${result.successful} of ${selectedIds.length} applicants. ${result.failed} failed.`);
          }
        } catch (error) {
          console.error('[onUpdateCell] Bulk non-status update failed:', error);
          setCellOverrides(prev => {
            const next = new Map(prev);
            for (const id of selectedIds) next.delete(`${id}::${columnId}`);
            return next;
          });
          toast.error('Failed to update selected applicants. Please try again.');
        }
      });
    } else {
      // Single cell — apply optimistic override immediately, then confirm with server
      const key = `${applicantId}::${columnId}`;
      setCellOverrides(prev => new Map(prev).set(key, value));

      startTransition(async () => {
        const result = await updateBoardCell(companyId, jobId, applicantId, columnId, columnType, value);
        if (!result.ok) {
          // Roll back the optimistic value
          setCellOverrides(prev => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
          console.warn('[onUpdateCell] Cell update rejected:', result);
          showCellError(result.message);
        } else if (columnType === 'status' && hasStatusMoveAutomations) {
          // Only refresh if there's an enabled move_group automation that may
          // have repositioned this applicant in the after() callback.
          setTimeout(() => router.refresh(), 1500);
        }
      });
    }
  }

  // ── Helper: compute frozen left offsets for a group's visible columns ──────
  function computeFrozenLeftOffsets(groupVisibleCols: BoardColumn[], collapsedColIds: Set<string>): number[] {
    const offsets: number[] = [];
    let cumLeft = STICKY_COL_WIDTH;
    for (let i = 0; i < frozenColumnsCount && i < groupVisibleCols.length; i++) {
      offsets.push(cumLeft);
      cumLeft += collapsedColIds.has(groupVisibleCols[i].id)
        ? 32
        : getColumnWidth(groupVisibleCols[i].id, groupVisibleCols[i].type);
    }
    return offsets;
  }

  // ── Virtual item renderer ──────────────────────────────────────────────────
  function renderVirtualItem(item: VirtualItem) {
    switch (item.kind) {
      case "group-header": {
        const g = item.group;
        const rows = sortedApplicantsByGroup.get(g.id) ?? [];
        const groupHiddenColIds = new Set<string>(g.settings?.hidden_columns ?? []);
        const groupVisibleCols = localColumns.filter((col) => !col.is_hidden && !groupHiddenColIds.has(col.id));
        return (
          <section
            className="rounded-t-[14px]"
            style={{
              borderLeft: `4px solid ${g.color}`,
              boxShadow: "0 0 0 1px rgba(15,22,35,0.08)",
            }}
          >
            <SortableGroupHeader
              group={g}
              rowCount={rows.length}
              isCollapsed={g.is_collapsed}
              onToggleCollapse={() => onToggleGroupCollapse(g.id, g.is_collapsed)}
              onColorChange={(color) => onUpdateGroupColor(g.id, color)}
              isEditing={editingGroupId === g.id}
              editValue={editingGroupValue}
              onStartEdit={() => {
                setEditingGroupId(g.id);
                setEditingGroupValue(g.name);
              }}
              onSaveEdit={() => onRenameGroup(g.id)}
              onCancelEdit={() => {
                setEditingGroupId(null);
                setEditingGroupValue("");
              }}
              onChange={setEditingGroupValue}
              menuOpen={groupMenuOpen === g.id}
              onMenuToggle={() => setGroupMenuOpen(groupMenuOpen === g.id ? null : g.id)}
              canDelete={localGroups.length > 1}
              onRename={() => {
                setEditingGroupId(g.id);
                setEditingGroupValue(g.name);
                setGroupMenuOpen(null);
              }}
              onDelete={() => {
                setGroupToDelete(g);
                setDeleteGroupModalOpen(true);
                setGroupMenuOpen(null);
              }}
              onMinimizeAll={() => {
                onMinimizeAllColumns(g.id);
                setGroupMenuOpen(null);
              }}
              onExpandAll={() => {
                onExpandAllColumns(g.id);
                setGroupMenuOpen(null);
              }}
              allColumns={localColumns}
              onHideColumn={(colId) => onHideColumnInGroup(colId, g.id)}
              onShowColumn={(colId) => onShowColumnInGroup(colId, g.id)}
              onUpdatePortalVisibility={(visible) => onUpdateGroupPortalVisibility(g.id, visible)}
              onUpdatePortalNote={(note) => onUpdateGroupPortalNote(g.id, note)}
              onUpdatePortalChecklist={(checklist) => onUpdateGroupPortalChecklist(g.id, checklist)}
              onUpdatePipelineVisibility={(show) => onUpdateGroupPipelineVisibility(g.id, show)}
              columns={groupVisibleCols}
              labelsByColumn={labelsByColumn}
              frozenColumnsCount={frozenColumnsCount}
              onFreezeColumns={handleFreezeColumns}
            />
          </section>
        );
      }

      case "column-headers": {
        const g = item.group;
        const rows = sortedApplicantsByGroup.get(g.id) ?? [];
        const collapsedColIds = new Set<string>(g.settings?.collapsed_columns ?? []);
        const frozenOffsets = computeFrozenLeftOffsets(item.columns, collapsedColIds);
        const gridTemplate = gridTemplateByGroup.get(g.id) ?? "";
        return (
          <div
            style={{
              borderLeft: `4px solid ${g.color}`,
              boxShadow: "0 0 0 1px rgba(15,22,35,0.08)",
            }}
          >
            <VirtualColumnHeaders
              columns={item.columns}
              rows={rows}
              selected={selected}
              toggleAllInGroup={toggleAllInGroup}
              groupId={g.id}
              gridTemplate={gridTemplate}
              onColumnWidthChange={onColumnWidthChange}
              onColumnWidthCommit={onColumnWidthCommit}
              onColumnWidthReset={onColumnWidthReset}
              onSaveColumnName={onSaveColumnName}
              onDeleteColumn={onDeleteColumn}
              onDuplicateColumn={onDuplicateColumn}
              onToggleMinimizeColumn={onToggleMinimizeColumn}
              onAddColumnRight={onAddColumnRight}
              onShowAddColumnModal={() => setShowAddColumnModal(true)}
              collapsedColIds={collapsedColIds}
              frozenColumnsCount={frozenColumnsCount}
              frozenLeftOffsets={frozenOffsets}
              sortState={sortState}
              onSort={handleSort}
              getColumnWidth={getColumnWidth}
            />
          </div>
        );
      }

      case "empty-row": {
        // Find the group for styling
        const g = localGroups.find((gr) => gr.id === item.groupId);
        return (
          <div
            className="py-8 pr-4 text-sm text-rf-text-muted text-left bg-rf-surface-card"
            style={{
              paddingLeft: 68,
              borderLeft: g ? `4px solid ${g.color}` : undefined,
              boxShadow: "0 0 0 1px rgba(15,22,35,0.08)",
            }}
          >
            No applicants in this group yet.
          </div>
        );
      }

      case "applicant-row": {
        const a = item.applicant;
        const g = localGroups.find((gr) => gr.id === item.groupId);
        const groupHiddenColIds = new Set<string>(g?.settings?.hidden_columns ?? []);
        const groupVisibleCols = localColumns.filter((col) => !col.is_hidden && !groupHiddenColIds.has(col.id));
        const collapsedColIds = new Set<string>(g?.settings?.collapsed_columns ?? []);
        const frozenOffsets = computeFrozenLeftOffsets(groupVisibleCols, collapsedColIds);
        const gridTemplate = gridTemplateByGroup.get(item.groupId) ?? "";

        // During row drag in this group, use SortableRow for dnd-kit compatibility
        if (draggingInGroupId === item.groupId) {
          return (
            <div
              style={{
                borderLeft: g ? `4px solid ${g.color}` : undefined,
                boxShadow: "0 0 0 1px rgba(15,22,35,0.08)",
              }}
            >
              <SortableRow
                applicant={a}
                columns={groupVisibleCols}
                selected={!!selected[a.id]}
                onToggle={() => toggleRow(a.id)}
                getCellValue={(col) => getCellValue(a, col)}
                onUpdateCell={(colId, colType, val) => onUpdateCell(a.id, colId, colType, val)}
                labelsByColumn={labelsByColumn}
                onEditLabels={setEditLabelsColumnId}
                rowMenuOpen={rowMenuOpen === a.id}
                setRowMenuOpen={(open) => setRowMenuOpen(open ? a.id : null)}
                groups={groups}
                onOpen={() => setDetailApplicantId(a.id)}
                onMove={(groupId) => onMoveApplicant(a.id, groupId)}
                onDuplicate={() => onDuplicateApplicant(a.id)}
                onArchive={() => onArchiveApplicant(a.id)}
                onDelete={() => onDeleteApplicant(a.id)}
                companyId={companyId}
                boardId={boardId}
                fadvReady={fadvReadyApplicantIds.has(a.id)}
                onSendToFadv={async () => {
                  const r = await sendToFadv(companyId, jobId, a.id);
                  if (!r.success) toast.error(`FADV: ${r.error}`);
                  else toast.success(`Sent to First Advantage${r.subjectId ? ` (ID: ${r.subjectId})` : ""}`);
                }}
                collapsedColumnIds={collapsedColIds}
                frozenColumnsCount={frozenColumnsCount}
                frozenLeftOffsets={frozenOffsets}
                gridTemplate={gridTemplate}
              />
            </div>
          );
        }

        return (
          <div
            style={{
              borderLeft: g ? `4px solid ${g.color}` : undefined,
              boxShadow: "0 0 0 1px rgba(15,22,35,0.08)",
            }}
          >
            <VirtualRow
              applicant={a}
              columns={groupVisibleCols}
              selected={!!selected[a.id]}
              onToggle={() => toggleRow(a.id)}
              getCellValue={(col) => getCellValue(a, col)}
              onUpdateCell={(colId, colType, val) => onUpdateCell(a.id, colId, colType, val)}
              labelsByColumn={labelsByColumn}
              onEditLabels={setEditLabelsColumnId}
              rowMenuOpen={rowMenuOpen === a.id}
              setRowMenuOpen={(open) => setRowMenuOpen(open ? a.id : null)}
              groups={groups}
              onOpen={() => setDetailApplicantId(a.id)}
              onMove={(groupId) => onMoveApplicant(a.id, groupId)}
              onDuplicate={() => onDuplicateApplicant(a.id)}
              onArchive={() => onArchiveApplicant(a.id)}
              onDelete={() => onDeleteApplicant(a.id)}
              companyId={companyId}
              boardId={boardId}
              fadvReady={fadvReadyApplicantIds.has(a.id)}
              onSendToFadv={async () => {
                const r = await sendToFadv(companyId, jobId, a.id);
                if (!r.success) toast.error(`FADV: ${r.error}`);
                else toast.success(`Sent to First Advantage${r.subjectId ? ` (ID: ${r.subjectId})` : ""}`);
              }}
              collapsedColumnIds={collapsedColIds}
              frozenColumnsCount={frozenColumnsCount}
              frozenLeftOffsets={frozenOffsets}
              gridTemplate={gridTemplate}
            />
          </div>
        );
      }

      case "add-item-row": {
        const g = localGroups.find((gr) => gr.id === item.groupId);
        return (
          <div
            className="bg-rf-surface-card rounded-b-[14px] group/addrow"
            style={{
              borderLeft: g ? `4px solid ${g.color}` : undefined,
              boxShadow: "0 0 0 1px rgba(15,22,35,0.08)",
            }}
          >
            <button
              onClick={() => onQuickCreateApplicant(item.groupId)}
              className="flex items-center gap-1.5 px-4 py-2 text-rf-text-muted opacity-0 group-hover/addrow:opacity-100 hover:text-rf-blue transition-all duration-150 focus:opacity-100 cursor-pointer"
            >
              <span className="text-sm font-semibold leading-none">+</span>
              <span className="text-sm font-medium">Add item</span>
            </button>
          </div>
        );
      }

      case "group-spacer":
        return <div style={{ height: 32 }} />;

      case "orphaned-header": {
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-2 bg-rf-danger-bg border border-red-200 rounded-lg p-3">
              <div className="h-4 w-4 rounded" style={{ backgroundColor: "#ef4444" }} />
              <h2 className="text-base font-semibold text-red-900">Orphaned Applicants</h2>
              <span className="text-sm text-rf-danger">({item.rowCount})</span>
              <span className="text-xs text-rf-danger ml-auto">
                Board mismatch - check console for details
              </span>
            </div>
            <div className="bg-red-100 p-3 text-sm text-rf-danger border-b border-red-200">
              <strong>Warning:</strong> These applicants have group_ids that don&apos;t match any group in the current board.
            </div>
          </div>
        );
      }

      case "orphaned-row": {
        const a = item.applicant;
        const gridTemplate = gridTemplateByGroup.get(localGroups[0]?.id ?? "") ?? "";
        return (
          <div className="border-2 border-red-300 bg-rf-danger-bg/30">
            <VirtualRow
              applicant={a}
              columns={visibleColumns}
              selected={!!selected[a.id]}
              onToggle={() => toggleRow(a.id)}
              getCellValue={(col) => getCellValue(a, col)}
              onUpdateCell={(colId, colType, val) => onUpdateCell(a.id, colId, colType, val)}
              labelsByColumn={labelsByColumn}
              onEditLabels={setEditLabelsColumnId}
              rowMenuOpen={rowMenuOpen === a.id}
              setRowMenuOpen={(open) => setRowMenuOpen(open ? a.id : null)}
              groups={groups}
              onOpen={() => setDetailApplicantId(a.id)}
              onMove={(groupId) => onMoveApplicant(a.id, groupId)}
              onDuplicate={() => onDuplicateApplicant(a.id)}
              onArchive={() => onArchiveApplicant(a.id)}
              onDelete={() => onDeleteApplicant(a.id)}
              companyId={companyId}
              boardId={boardId}
              fadvReady={fadvReadyApplicantIds.has(a.id)}
              onSendToFadv={async () => {
                const r = await sendToFadv(companyId, jobId, a.id);
                if (!r.success) toast.error(`FADV: ${r.error}`);
                else toast.success(`Sent to First Advantage${r.subjectId ? ` (ID: ${r.subjectId})` : ""}`);
              }}
              gridTemplate={gridTemplate}
            />
          </div>
        );
      }

      case "add-group-button":
        return (
          <div className="pt-3 px-2">
            <button
              onClick={handleAddNewGroup}
              disabled={isPending}
              className="flex items-center gap-2 h-8 px-3 text-sm text-rf-text-secondary hover:text-rf-ink-700 bg-rf-surface-card hover:bg-rf-surface-page border border-dashed border-rf-ink-100 hover:border-rf-ink-300 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="font-medium">+</span>
              <span>Add new group</span>
            </button>
          </div>
        );

      case "no-results":
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-rf-ink-700 font-medium">No results found</p>
            <p className="text-rf-text-muted text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        );

      default:
        return null;
    }
  }

  if (!mounted) {
    return <div className="min-h-[60vh] bg-rf-surface-page" />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* Floating overlay shown while dragging a group header */}
      <DragOverlay dropAnimation={null}>
        {activeDragId?.startsWith("group-") ? (() => {
          const g = localGroups.find((gr) => `group-${gr.id}` === activeDragId);
          if (!g) return null;
          return (
            <div
              className="flex items-center gap-3 px-5 py-3.5 rounded-[14px] bg-rf-surface-card shadow-2xl border border-rf-border"
              style={{ borderLeft: `4px solid ${g.color}`, opacity: 0.95, cursor: "grabbing" }}
            >
              <span className="text-sm text-rf-text-muted">⋮⋮</span>
              <span className="text-base font-semibold" style={{ color: g.color }}>{g.name}</span>
              <span className="text-sm text-rf-text-muted">
                ({(sortedApplicantsByGroup.get(g.id) ?? []).length})
              </span>
            </div>
          );
        })() : null}
      </DragOverlay>

      {/* Cell validation / server error toast */}
      {cellErrorMsg && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-red-200 bg-rf-surface-card px-4 py-3 shadow-lg max-w-sm">
          <svg className="h-5 w-5 flex-shrink-0 text-rf-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-rf-ink-700 flex-1">{cellErrorMsg}</span>
          <button
            onClick={() => { if (cellErrorTimeout.current) clearTimeout(cellErrorTimeout.current); setCellErrorMsg(null); }}
            className="flex-shrink-0 text-rf-text-muted hover:text-rf-ink-500 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex flex-col h-full min-h-0 bg-rf-surface-page">

        {/* ====== MOBILE CARD VIEW (hidden on md+) ====== */}
        <div className="md:hidden flex-1 overflow-auto min-h-0">
          <div className="p-3 space-y-6">
            {localGroups.map((g) => {
              const rows = sortedApplicantsByGroup.get(g.id) ?? [];
              const isFiltering = !!searchQuery || (activeFilters ?? []).length > 0;
              if (isFiltering && rows.length === 0) return null;
              return (
                <section
                  key={g.id}
                  className="border-l-[4px] pl-2 mb-6"
                  style={{ borderLeftColor: g.color }}
                >
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <button
                      onClick={() => onToggleGroupCollapse(g.id, g.is_collapsed)}
                      className="text-rf-text-secondary text-xs"
                    >
                      {g.is_collapsed ? "▶" : "▼"}
                    </button>
                    <span className="font-semibold text-sm" style={{ color: g.color }}>{g.name}</span>
                    <span className="text-xs text-rf-text-muted">({rows.length})</span>
                  </div>

                  {!g.is_collapsed && (
                    <div className="space-y-2">
                      {rows.map((a) => {
                        const isExpanded = !!mobileExpandedRows[a.id];
                        const menuOpen = rowMenuOpen === a.id;

                        // Identify key columns to surface at top of card
                        const nameCol = visibleColumns.find(c => c.is_system && c.name === "Name");
                        const firstNameCol = visibleColumns.find(c => c.name.toLowerCase() === "first name");
                        const lastNameCol = visibleColumns.find(c => c.name.toLowerCase() === "last name");
                        const statusCols = visibleColumns.filter(c => c.type === "status");
                        const emailCols = visibleColumns.filter(c => c.type === "email" || (c.is_system && c.name === "Email"));
                        const phoneCols = visibleColumns.filter(c => c.type === "phone" || (c.is_system && c.name === "Phone"));
                        const primaryStatusCol = statusCols[0];
                        // Compose display name from First Name + Last Name columns when available
                        const composedName = [
                          firstNameCol ? getCellValue(a, firstNameCol) : null,
                          lastNameCol ? getCellValue(a, lastNameCol) : null,
                        ].filter(Boolean).join(" ") || null;
                        const displayName = nameCol
                          ? (getCellValue(a, nameCol) as string) || composedName || a.full_name
                          : composedName || a.full_name;
                        // Remaining columns for the expanded section
                        const keyColIds = new Set([
                          nameCol?.id,
                          primaryStatusCol?.id,
                          emailCols[0]?.id,
                          phoneCols[0]?.id,
                        ].filter(Boolean));
                        const expandedCols = visibleColumns.filter(c => !keyColIds.has(c.id));

                        return (
                          <div
                            key={a.id}
                            className={`bg-rf-surface-card rounded-xl border border-rf-border shadow-sm overflow-hidden ${selected[a.id] ? "ring-2 ring-rf-blue" : ""}`}
                          >
                            {/* Card top: Name + menu */}
                            <div className="flex items-start justify-between px-4 pt-3 pb-1">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={!!selected[a.id]}
                                  onChange={() => toggleRow(a.id)}
                                  className="h-4 w-4 rounded border-rf-ink-100 flex-shrink-0"
                                />
                                <span className="font-semibold text-rf-text-primary text-sm truncate">
                                  {displayName}
                                </span>
                                {fadvReadyApplicantIds.has(a.id) && (
                                  <span className="ml-1 flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rf-blue-tint text-rf-blue border border-rf-blue-tint">
                                    ✓ FADV
                                  </span>
                                )}
                              </div>
                              {/* Row actions menu */}
                              <div className="relative flex-shrink-0 ml-2">
                                <button
                                  onClick={() => setRowMenuOpen(menuOpen ? null : a.id)}
                                  className="p-1.5 hover:bg-rf-surface-page rounded-lg text-rf-text-secondary min-h-[36px] min-w-[36px] flex items-center justify-center"
                                >
                                  ⋮
                                </button>
                                {menuOpen && (
                                  <>
                                    <div className="fixed inset-0 z-[30]" onClick={() => setRowMenuOpen(null)} />
                                    <div className="absolute right-0 top-full mt-1 z-[31] w-64 rounded-xl border border-rf-border bg-rf-surface-card shadow-2xl overflow-hidden">
                                      {/* Applicant name header */}
                                      <div className="px-4 py-3 border-b border-rf-ink-100 bg-rf-surface-page">
                                        <p className="text-xs font-semibold text-rf-text-secondary uppercase tracking-wider truncate">
                                          {a.full_name ?? "Applicant"}
                                        </p>
                                      </div>
                                      {/* Open detail */}
                                      <div className="py-2 border-b border-rf-ink-100">
                                        <button
                                          onClick={() => { setRowMenuOpen(null); setDetailApplicantId(a.id); }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                                        >
                                          <ExternalLink className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                                          Open
                                        </button>
                                      </div>
                                      {/* Move to */}
                                      <div className="py-2">
                                        <p className="px-4 py-1.5 text-xs font-semibold text-rf-text-muted uppercase tracking-wider">Move to</p>
                                        {localGroups.map((grp) => (
                                          <button
                                            key={grp.id}
                                            onClick={() => { onMoveApplicant(a.id, grp.id); setRowMenuOpen(null); }}
                                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                                          >
                                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: grp.color }} />
                                            {grp.name}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="border-t border-rf-ink-100" />
                                      {/* Actions */}
                                      <div className="py-2">
                                        <button
                                          onClick={() => { setRowMenuOpen(null); onDuplicateApplicant(a.id); }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                                        >
                                          <Copy className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                                          Duplicate
                                        </button>
                                        <button
                                          onClick={async () => {
                                            setRowMenuOpen(null);
                                            const r = await sendToFadv(companyId, jobId, a.id);
                                            if (!r.success) toast.error(`FADV: ${r.error}`);
                                            else toast.success(`Sent to First Advantage${r.subjectId ? ` (ID: ${r.subjectId})` : ""}`);
                                          }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-blue hover:bg-rf-blue-tint transition-colors text-left"
                                        >
                                          <Send className="w-4 h-4 flex-shrink-0" />
                                          Send to FADV
                                        </button>
                                        <button
                                          onClick={() => {
                                            setRowMenuOpen(null);
                                            router.push(`/dashboard/${companyId}/applicants/${a.id}/training`);
                                          }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                                        >
                                          <GraduationCap className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                                          Training Progress
                                        </button>
                                        {a.portal_token && (
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(
                                                `${window.location.origin}/status/${a.portal_token}`
                                              );
                                              setRowMenuOpen(null);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                                          >
                                            <Link2 className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                                            Copy status link
                                          </button>
                                        )}
                                      </div>
                                      <div className="border-t border-rf-ink-100" />
                                      {/* Archive & Danger */}
                                      <div className="py-2">
                                        <button
                                          onClick={() => { setRowMenuOpen(null); onArchiveApplicant(a.id); }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                                        >
                                          <Archive className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                                          Archive
                                        </button>
                                        <button
                                          onClick={() => { setRowMenuOpen(null); onDeleteApplicant(a.id); }}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-danger hover:bg-rf-danger-bg transition-colors text-left"
                                        >
                                          <Trash2 className="w-4 h-4 flex-shrink-0" />
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Key info row */}
                            <div className="px-4 pb-2 space-y-1.5">
                              {/* Status badge */}
                              {primaryStatusCol && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-rf-text-secondary w-16 flex-shrink-0">Status</span>
                                  <div className="flex-1 min-w-0">
                                    <CellRenderer
                                      applicant={a}
                                      column={primaryStatusCol}
                                      value={getCellValue(a, primaryStatusCol)}
                                      labels={labelsByColumn.get(primaryStatusCol.id) ?? []}
                                      onUpdate={(val) => onUpdateCell(a.id, primaryStatusCol.id, primaryStatusCol.type as any, val)}
                                      onEditLabels={() => setEditLabelsColumnId(primaryStatusCol.id)}
                                    />
                                  </div>
                                </div>
                              )}
                              {/* Email */}
                              {emailCols[0] && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-rf-text-secondary w-16 flex-shrink-0">Email</span>
                                  <span className="text-sm text-rf-ink-700 truncate">
                                    {(getCellValue(a, emailCols[0]) as string) || a.email || "—"}
                                  </span>
                                </div>
                              )}
                              {/* Phone */}
                              {phoneCols[0] && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-rf-text-secondary w-16 flex-shrink-0">Phone</span>
                                  <span className="text-sm text-rf-ink-700 truncate">
                                    {(getCellValue(a, phoneCols[0]) as string) || a.phone || "—"}
                                  </span>
                                </div>
                              )}
                              {/* Applied date */}
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-rf-text-secondary w-16 flex-shrink-0">Applied</span>
                                <span className="text-xs text-rf-text-muted">
                                  {new Date(a.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>

                            {/* Expand toggle */}
                            {expandedCols.length > 0 && (
                              <button
                                onClick={() => setMobileExpandedRows(prev => ({ ...prev, [a.id]: !isExpanded }))}
                                className="w-full px-4 py-2 text-xs text-rf-text-secondary hover:text-rf-ink-700 hover:bg-rf-surface-page border-t border-rf-ink-100 text-left flex items-center gap-1 transition-colors"
                              >
                                {isExpanded ? "▲ Show less" : `▼ Show ${expandedCols.length} more field${expandedCols.length !== 1 ? "s" : ""}`}
                              </button>
                            )}

                            {/* Expanded: all other columns */}
                            {isExpanded && (
                              <div className="px-4 pb-3 pt-1 border-t border-rf-ink-100 space-y-2 bg-rf-surface-page">
                                {expandedCols.map((col) => (
                                  <div key={col.id} className="flex items-start gap-2">
                                    <span className="text-xs text-rf-text-secondary w-24 flex-shrink-0 pt-1.5">{col.name}</span>
                                    <div className="flex-1 min-w-0">
                                      <CellRenderer
                                        applicant={a}
                                        column={col}
                                        value={getCellValue(a, col)}
                                        labels={labelsByColumn.get(col.id) ?? []}
                                        onUpdate={(val) => onUpdateCell(a.id, col.id, col.type as any, val)}
                                        onEditLabels={() => setEditLabelsColumnId(col.id)}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Add item */}
                      <button
                        onClick={() => onQuickCreateApplicant(g.id)}
                        disabled={isPending}
                        className="w-full py-2.5 text-sm text-rf-text-muted hover:text-rf-blue hover:bg-rf-blue-tint/30 rounded-xl border border-dashed border-rf-border transition-colors"
                      >
                        + Add item
                      </button>
                    </div>
                  )}
                </section>
              );
            })}

            {/* No results — mobile */}
            {(!!searchQuery || (activeFilters ?? []).length > 0) &&
              localGroups.every((g) => (applicantsByGroup.get(g.id) ?? []).length === 0) && (
                <div className="py-16 text-center">
                  <p className="text-rf-ink-700 font-medium text-sm">No results found</p>
                  <p className="text-rf-text-muted text-xs mt-1">Try adjusting your search or filters</p>
                </div>
              )}

            {/* Add new group on mobile — subtle */}
            <button
              onClick={handleAddNewGroup}
              disabled={isPending}
              className="flex items-center gap-2 h-10 px-3 text-sm text-rf-text-secondary hover:text-rf-ink-700 bg-rf-surface-card hover:bg-rf-surface-page border border-dashed border-rf-ink-100 hover:border-rf-ink-300 rounded-xl transition-colors w-full justify-center disabled:opacity-50"
            >
              <span className="font-medium">+</span>
              <span>Add new group</span>
            </button>
          </div>
        </div>

        {/* ====== DESKTOP VIRTUAL TABLE VIEW (hidden on mobile) ====== */}
        <div
          ref={scrollContainerRef}
          className="hidden md:block flex-1 overflow-auto min-h-0"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              minWidth: `${maxGridWidth}px`,
              paddingLeft: "32px",
              paddingRight: "32px",
            }}
          >
            <SortableContext
              items={localGroups.map((g) => `group-${g.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {/* Column-drag SortableContext — always active so column reordering works */}
              <SortableContext
                items={visibleColumns.map((c) => `col-${c.id}`)}
                strategy={horizontalListSortingStrategy}
              >
                {/* Row-drag SortableContext — only active during row drag for the dragging group */}
                <SortableContext
                  items={
                    draggingInGroupId
                      ? (sortedApplicantsByGroup.get(draggingInGroupId) ?? []).map(
                          (r) => `row-${r.id}`
                        )
                      : []
                  }
                  strategy={verticalListSortingStrategy}
                >
                  {virtualizer.getVirtualItems().map((vi) => {
                    const item = flatItems[vi.index];
                    return (
                      <div
                        key={vi.key}
                        data-index={vi.index}
                        data-vstart={vi.start}
                        data-kind={item.kind}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${vi.size}px`,
                          transform: `translateY(var(--y, ${vi.start}px))`,
                        }}
                      >
                        {renderVirtualItem(item)}
                      </div>
                    );
                  })}
                </SortableContext>
              </SortableContext>
            </SortableContext>
          </div>
        </div>

        {/* Add Column Modal */}
        {showAddColumnModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm p-0 sm:p-4">
            <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-rf-border bg-rf-surface-card p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-rf-text-primary">Add Column</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-rf-ink-700">Column name</label>
                  <input
                    value={newColumnName}
                    onChange={(e) => {
                      setNewColumnName(e.target.value);
                      setAddColumnError(null);
                    }}
                    placeholder="e.g. Interview Score"
                    className="mt-1 h-11 w-full rounded-lg border border-rf-border bg-rf-surface-card px-3 text-base outline-none focus:border-rf-ink-300"
                    autoFocus
                  />
                  {addColumnError && (
                    <p className="mt-1.5 text-xs text-rf-danger">{addColumnError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-rf-ink-700">Column type</label>
                  <select
                    value={newColumnType}
                    onChange={(e) => setNewColumnType(e.target.value as any)}
                    className="mt-1 h-11 w-full rounded-lg border border-rf-border bg-rf-surface-card px-3 text-base outline-none focus:border-rf-ink-300"
                  >
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="location">Location</option>
                    <option value="file">File</option>
                    <option value="status">Status</option>
                    <option value="checkbox">Checkbox</option>
                    <optgroup label="First Advantage (FADV)">
                      <option value="fadv.package">FADV: Package</option>
                      <option value="fadv.location">FADV: Location</option>
                      <option value="fadv.facility_id">FADV: Facility ID</option>
                      <option value="fadv.position_type">FADV: Position Type</option>
                    </optgroup>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddColumnModal(false);
                    setNewColumnName("");
                    setNewColumnType("text");
                    setAddColumnError(null);
                    setAddAfterColumnId(null);
                  }}
                  className="h-11 rounded-lg border border-rf-border bg-rf-surface-card px-4 text-sm font-medium text-rf-ink-700 hover:bg-rf-surface-page w-full sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  onClick={onAddColumn}
                  disabled={isPending || !newColumnName.trim()}
                  className="h-11 rounded-lg bg-rf-ink-900 px-4 text-sm font-medium text-white hover:bg-rf-ink-700 disabled:opacity-60 w-full sm:w-auto"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Board Default Values Modal */}
        {showDefaultValues && (
          <BoardDefaultValuesModal
            companyId={companyId}
            jobId={jobId}
            columns={localColumns.filter(c => !c.is_system && !["file", "location"].includes(c.type))}
            labelsByColumn={labelsByColumn}
            onSaved={(updates) => {
              // Optimistically update localColumns so the modal reflects the new state if reopened
              setLocalColumns(prev =>
                prev.map(col => {
                  const u = updates.find(u => u.columnId === col.id);
                  if (!u) return col;
                  return { ...col, settings: { ...(col.settings ?? {}), default_value: u.defaultValue ?? null } };
                })
              );
            }}
            onClose={() => onCloseDefaultValues?.()}
          />
        )}

        {/* Status Labels Editor Modal */}
        {editLabelsColumnId && (
          <StatusLabelsEditor
            companyId={companyId}
            jobId={jobId}
            columnId={editLabelsColumnId}
            labels={labelsByColumn.get(editLabelsColumnId) ?? []}
            onClose={() => {
              setEditLabelsColumnId(null);
              // Refresh to get updated label colors from server
              router.refresh();
            }}
          />
        )}

        {/* Bulk action bar */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-0 sm:bottom-6 left-0 sm:left-1/2 right-0 sm:right-auto z-50 w-full sm:w-[min(920px,calc(100%-24px))] sm:-translate-x-1/2 rounded-none sm:rounded-xl border-t sm:border border-rf-border bg-rf-surface-card px-4 py-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-rf-ink-700">
                <span className="font-semibold">{selectedIds.length}</span> selected
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  onChange={(e) => {
                    const groupId = e.target.value;
                    if (groupId) onMoveToGroup(groupId);
                    e.currentTarget.value = "";
                  }}
                  className="h-10 rounded-lg border border-rf-border bg-rf-surface-card px-3 text-sm outline-none"
                  defaultValue=""
                  disabled={isPending}
                >
                  <option value="" disabled>
                    Move to group…
                  </option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setShowMassEmail(true)}
                  disabled={isPending}
                  className="h-10 rounded-lg border border-rf-border bg-rf-surface-card px-4 text-sm font-medium text-rf-ink-700 hover:bg-rf-surface-page disabled:opacity-60 flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Mass email
                </button>

                <button
                  onClick={onBulkArchive}
                  disabled={isPending}
                  className="h-10 rounded-lg border border-rf-border bg-rf-surface-card px-4 text-sm font-medium text-rf-ink-700 hover:bg-rf-surface-page disabled:opacity-60 flex items-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>

                <button
                  onClick={onBulkDelete}
                  disabled={isPending}
                  className="h-10 rounded-lg bg-rf-danger px-4 text-sm font-medium text-white hover:bg-rf-danger disabled:opacity-60"
                >
                  Delete
                </button>

                <button
                  onClick={clearSelection}
                  disabled={isPending}
                  className="h-10 rounded-lg border border-rf-border bg-rf-surface-card px-4 text-sm font-medium text-rf-text-primary hover:bg-rf-surface-page disabled:opacity-60"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mass Email dialog */}
        <MassEmailDialog
          open={showMassEmail}
          onClose={() => setShowMassEmail(false)}
          recipients={(() => {
            // Collect all email-type column ids
            const emailColumnIds = new Set(
              columns.filter((c) => c.type === "email").map((c) => c.id)
            );
            // Build lookup: applicant_id → first non-empty email cell value
            const emailFromCells = new Map<string, string>();
            for (const cell of cells) {
              if (emailColumnIds.has(cell.column_id) && cell.value_text?.trim()) {
                if (!emailFromCells.has(cell.applicant_id)) {
                  emailFromCells.set(cell.applicant_id, cell.value_text.trim());
                }
              }
            }
            return applicants
              .filter((a) => selectedIds.includes(a.id))
              .map((a) => ({
                id: a.id,
                full_name: a.full_name,
                email: a.email?.trim() || emailFromCells.get(a.id) || "",
              }));
          })()}
          companyId={companyId}
          jobId={jobId}
          columns={columns}
          onSend={async (subject, body) => {
            const result = await bulkSendEmail(companyId, jobId, selectedIds, subject, body);
            return result;
          }}
        />

          {/* Archive drawer */}
        <ArchiveDrawer
          open={showArchiveDrawer}
          onClose={() => onCloseArchiveDrawer?.()}
          companyId={companyId}
          jobId={jobId}
        />

        {/* Delete Group Modal */}
        {groupToDelete && (
          <DeleteConfirmationModal
            open={deleteGroupModalOpen}
            onClose={() => {
              setDeleteGroupModalOpen(false);
              setGroupToDelete(null);
            }}
            title="Delete Group"
            description="All applicants in this group will be moved to the first remaining group."
            itemName={groupToDelete.name}
            onDelete={async () => {
              if (!groupToDelete) return { error: "No group selected" };
              const result = await deleteGroup(companyId, jobId, boardId, groupToDelete.id);
              if (result?.error) return { error: result.error };
              return { success: true };
            }}
          />
        )}
      </div>

      {/* Applicant detail side panel */}
      {detailApplicantId && (() => {
        const detailApplicant = localApplicants.find((a) => a.id === detailApplicantId);
        if (!detailApplicant) return null;
        const detailGroup = localGroups.find((g) => g.id === detailApplicant.group_id);
        return (
          <ApplicantDetailPanel
            applicant={detailApplicant}
            group={detailGroup}
            columns={localColumns}
            cells={cells}
            labelsByColumn={labelsByColumn}
            onClose={() => setDetailApplicantId(null)}
          />
        );
      })()}
    </DndContext>
  );
}
