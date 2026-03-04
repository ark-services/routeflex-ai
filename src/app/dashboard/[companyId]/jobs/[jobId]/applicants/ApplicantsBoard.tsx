"use client";

import { useEffect, useMemo, useState, useTransition, useRef, useCallback } from "react";
import {
  ArrowLeftRight,
  PencilLine,
  Trash2,
  ChevronsLeftRight,
  Plus,
  RotateCcw,
  Copy,
  Send,
  GraduationCap,
  MoveRight,
  Link2,
  Maximize2,
  X as XIcon,
  ExternalLink,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  bulkDeleteApplicants,
  bulkMoveApplicants,
  bulkUpdateStatusCells,
  createBoardColumn,
  createGroup,
  createStatusLabel,
  deleteBoardColumn,
  deleteStatusLabel,
  duplicateBoardColumn,
  toggleGroupCollapse,
  updateBoardCell,
  updateBoardColumn,
  updateStatusLabel,
  updateGroupColor,
  moveApplicant,
  deleteApplicant,
  duplicateApplicant,
  reorderApplicants,
  reorderColumns,
  renameGroup,
  deleteGroup,
  reorderGroups,
  quickCreateApplicant,
  sendToFadv,
  updateGroupCollapsedColumns,
  type CellUpdateResult,
} from "./actions";
import { updateBoardGroupPortalSettings, updateBoardGroupPortalChecklist } from "./portal-actions";
import type { PortalChecklistItem } from "./portal-actions";
import { DeleteConfirmationModal } from "@/components/modals/delete-confirmation-modal";
import { statusColorArray, STATUS_COLOR_PALETTE } from "@/lib/brand-colors";
import { StatusDropdown } from "@/components/ui/status-dropdown";
import { ColorPicker } from "@/components/ui/color-picker";
import { formatPhone, validatePhone, validateEmail } from "@/lib/validation/columnValidation";
import type { BoardColumn as BaseBoardColumn, BoardCell, BoardStatusLabel } from "@/lib/types";
import type { ActiveFilter } from "./view-actions";
import { createClient } from "@/lib/supabase/client";

type Group = {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  is_collapsed: boolean;
  settings?: { collapsed_columns?: string[]; portal_checklist?: PortalChecklistItem[] };
  visible_to_applicants?: boolean;
  applicant_note?: string | null;
};

type ApplicantRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
  resume_path: string | null;
  jobs: { title: string } | null;
  group_id: string | null;
  position: number;
  portal_token?: string | null;
};

// Extend BoardColumn with job-specific UI fields
type BoardColumn = BaseBoardColumn & {
  is_hidden?: boolean;
  settings?: {
    ui?: {
      collapsed?: boolean;
      width?: number;
    };
  };
};

// Alias for compatibility
type StatusLabel = BoardStatusLabel;
// BoardCell imported from @/lib/types includes all value columns including value_file_path

const PRESET_COLORS = statusColorArray.map(c => c.value);

const COLUMN_MIN_WIDTH = 90;
const COLUMN_MAX_WIDTH = 600;
const STICKY_COL_WIDTH = 56;
const ADD_COL_BTN_WIDTH = 56;

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  text: 180, number: 120, date: 140,
  file: 140, status: 160, email: 200,
  phone: 150, location: 200,
};

function getDefaultWidth(type: string): number {
  return DEFAULT_COLUMN_WIDTHS[type] ?? 180;
}

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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
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

  // Local state for optimistic updates
  const [localColumns, setLocalColumns] = useState(columns);
  const [localApplicants, setLocalApplicants] = useState(applicants);
  const [localGroups, setLocalGroups] = useState(groups);

  // Mobile card expanded state
  const [mobileExpandedRows, setMobileExpandedRows] = useState<Record<string, boolean>>({});

  // Avoid hydration mismatches with DnD/table markup by rendering after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update local state when props change
  useMemo(() => {
    setLocalColumns(columns);
  }, [columns]);

  useMemo(() => {
    setLocalApplicants(applicants);
  }, [applicants]);

  useMemo(() => {
    setLocalGroups(groups);
  }, [groups]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const col of columns) {
      init[col.id] = col.settings?.ui?.width ?? getDefaultWidth(col.type);
    }
    return init;
  });

  useMemo(() => {
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

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;

    // Detect group dragging and collapse groups
    if (active.id.toString().startsWith("group-")) {
      setIsDraggingGroup(true);
      setGroupsBeforeDrag(localGroups);

      // Collapse all groups for better UX during drag
      startTransition(async () => {
        for (const g of localGroups) {
          if (!g.is_collapsed) {
            await toggleGroupCollapse(companyId, jobId, boardId, g.id, true);
          }
        }
      });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      // Reset drag state
      if (isDraggingGroup) {
        setIsDraggingGroup(false);
      }
      return;
    }

    // Handle group reordering
    if (active.id.toString().startsWith("group-")) {
      const oldIndex = localGroups.findIndex((g) => `group-${g.id}` === active.id);
      const newIndex = localGroups.findIndex((g) => `group-${g.id}` === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(localGroups, oldIndex, newIndex);
        setLocalGroups(newOrder);

        // Persist to DB and restore collapse state
        startTransition(async () => {
          await reorderGroups(
            companyId,
            jobId,
            boardId,
            newOrder.map((g) => g.id)
          );

          // Restore pre-drag collapse state for each group
          for (const beforeGroup of groupsBeforeDrag) {
            if (!beforeGroup.is_collapsed) {
              // Group was expanded before drag, restore it
              await toggleGroupCollapse(companyId, jobId, boardId, beforeGroup.id, false);
            }
          }
        });
      }

      setIsDraggingGroup(false);
      return;
    }

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
    // Restore pre-drag collapse state
    if (isDraggingGroup) {
      setIsDraggingGroup(false);

      // Restore collapse state for each group
      startTransition(async () => {
        for (const beforeGroup of groupsBeforeDrag) {
          const currentGroup = localGroups.find((g) => g.id === beforeGroup.id);
          if (currentGroup && currentGroup.is_collapsed !== beforeGroup.is_collapsed) {
            await toggleGroupCollapse(companyId, jobId, boardId, beforeGroup.id, beforeGroup.is_collapsed);
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

  function onBulkDelete() {
    if (selectedIds.length === 0) return;
    const ok = confirm(`Delete ${selectedIds.length} applicant(s)? This cannot be undone.`);
    if (!ok) return;

    startTransition(async () => {
      await bulkDeleteApplicants(companyId, jobId, selectedIds);
      clearSelection(); // Clear selection since deleted rows no longer exist
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
        alert(result.error);
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

  function onDeleteColumn(columnId: string) {
    const ok = confirm("Delete this column? All data in this column will be lost.");
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
    const allColumnIds = visibleColumns.map((c) => c.id);
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

  function onShowColumn(columnId: string) {
    setLocalColumns((prev) => prev.map((c) => c.id === columnId ? { ...c, is_hidden: false } : c));
    startTransition(async () => {
      await updateBoardColumn(companyId, jobId, columnId, { is_hidden: false });
    });
  }

  function onHideColumn(columnId: string) {
    setLocalColumns((prev) => prev.map((c) => c.id === columnId ? { ...c, is_hidden: true } : c));
    startTransition(async () => {
      await updateBoardColumn(companyId, jobId, columnId, { is_hidden: true });
    });
  }

  function onAddColumnRight(afterColumnId: string) {
    setAddAfterColumnId(afterColumnId);
    setShowAddColumnModal(true);
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
        alert("Failed to move applicant. Please try again.");
      }
    });
  }

  function onDeleteApplicant(applicantId: string) {
    const ok = confirm("Delete this applicant? This cannot be undone.");
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
      // Bare path only (no metadata) — synthesize a minimal StoredFile
      if (cell.value_file_path) {
        const name = cell.value_file_path.split("/").pop() || "File";
        return [{
          id: cell.value_file_path,
          name,
          path: cell.value_file_path,
          bucket: "files",
          type: "",
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
        const newApplicant = await quickCreateApplicant(companyId, jobId, groupId, boardId);
        // Append new row to local state — no RSC refetch needed.
        // Dedup by id: the realtime subscription may have already added this
        // row if the postgres_changes event arrived before this callback ran.
        if (newApplicant) {
          applicantIdSetRef.current.add(newApplicant.id);
          setLocalApplicants(prev => {
            if (prev.some(a => a.id === newApplicant.id)) return prev;
            return [...prev, newApplicant];
          });
        }
      } catch (error) {
        console.error("[onQuickCreateApplicant] Error:", error);
        alert("Failed to create applicant. Please try again.");
      }
    });
  }

  function onUpdateCell(applicantId: string, columnId: string, columnType: "text" | "number" | "date" | "status" | "checkbox" | "email" | "phone" | "location" | "file" | "fadv.package" | "fadv.location" | "fadv.facility_id" | "fadv.position_type", value: any) {
    // BULK STATUS UPDATE: If this is a status column AND multiple rows are selected AND this row is selected,
    // update all selected rows with the new status value
    if (columnType === "status" && selectedIds.length > 1 && selected[applicantId]) {
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
            alert(`Updated ${result.successful} of ${selectedIds.length} applicants. ${result.failed} failed.`);
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
          alert('Failed to update selected applicants. Please try again.');
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

  if (!mounted) {
    return <div className="min-h-[60vh] bg-rf-surface-page" />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
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
              const rows = applicantsByGroup.get(g.id) ?? [];
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
                        const statusCols = visibleColumns.filter(c => c.type === "status");
                        const emailCols = visibleColumns.filter(c => c.type === "email" || (c.is_system && c.name === "Email"));
                        const phoneCols = visibleColumns.filter(c => c.type === "phone" || (c.is_system && c.name === "Phone"));
                        const primaryStatusCol = statusCols[0];
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
                                  {nameCol ? (getCellValue(a, nameCol) as string) || a.full_name : a.full_name}
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
                                            if (!r.success) alert(`FADV: ${r.error}`);
                                            else alert(`Sent to First Advantage${r.subjectId ? ` (ID: ${r.subjectId})` : ""}`);
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
                                      {/* Danger */}
                                      <div className="py-2">
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

        {/* ====== DESKTOP TABLE VIEW (hidden on mobile) ====== */}
        <div className="hidden md:block flex-1 overflow-auto min-h-0">
          <div className="min-w-max px-8 py-7">
            {/* Groups */}
            <div className="space-y-8">
              {/* Wrap groups in SortableContext */}
              <SortableContext
                items={localGroups.map((g) => `group-${g.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {/* Render regular groups */}
                {localGroups.map((g) => {
                  const rows = applicantsByGroup.get(g.id) ?? [];
                  const isFiltering = !!searchQuery || (activeFilters ?? []).length > 0;
                  if (isFiltering && rows.length === 0) return null;
                  return (
                    <section
                      key={g.id}
                      className="mb-5 rounded-[14px]"
                      style={{
                        borderLeft: `4px solid ${g.color}`,
                        boxShadow: '0 0 0 1px rgba(15,22,35,0.08)',
                      }}
                    >
                      {/* Sortable Group header */}
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
                        onHideColumn={onHideColumn}
                        onShowColumn={onShowColumn}
                        onUpdatePortalVisibility={(visible) => onUpdateGroupPortalVisibility(g.id, visible)}
                        onUpdatePortalNote={(note) => onUpdateGroupPortalNote(g.id, note)}
                        onUpdatePortalChecklist={(checklist) => onUpdateGroupPortalChecklist(g.id, checklist)}
                        columns={visibleColumns}
                        labelsByColumn={labelsByColumn}
                      />

                    {/* Group table */}
                    {!g.is_collapsed && (() => {
                      const collapsedColIds = new Set<string>(g.settings?.collapsed_columns ?? []);
                      const groupTableWidth = getGroupTableWidth(collapsedColIds);
                      return (
                      <div
                        className="overflow-visible rounded-b-[14px] bg-rf-surface-card"
                      >
                        <table
                          className="text-left border-collapse"
                          style={{ tableLayout: 'fixed', width: `${groupTableWidth}px` }}
                        >
                          <colgroup>
                            <col style={{ width: `${STICKY_COL_WIDTH}px` }} />
                            {visibleColumns.map(col => (
                              <col
                                key={col.id}
                                style={{ width: collapsedColIds.has(col.id) ? "32px" : `${getColumnWidth(col.id, col.type)}px` }}
                              />
                            ))}
                            <col style={{ width: `${ADD_COL_BTN_WIDTH}px` }} />
                          </colgroup>
                          <thead className="bg-rf-surface-card sticky top-[41px] z-20">
                            <tr className="border-b border-rf-border">
                              <th className="sticky left-0 z-20 w-10 bg-rf-surface-card px-4 py-2">
                                <div className="flex items-center gap-2">
                                  {/* invisible spacer matching the hidden ⋮ row-menu button */}
                                  <div className="opacity-0 text-sm select-none">⋮</div>
                                  {rows.length > 0 && (() => {
                                    const allSelected = rows.every((r) => selected[r.id]);
                                    const someSelected = !allSelected && rows.some((r) => selected[r.id]);
                                    return (
                                      <input
                                        type="checkbox"
                                        checked={allSelected}
                                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                                        onChange={() => toggleAllInGroup(g.id, rows)}
                                        className="h-4 w-4 rounded border-rf-ink-100 cursor-pointer accent-green-600"
                                      />
                                    );
                                  })()}
                                </div>
                              </th>

                              {/* Sortable columns */}
                              <SortableContext
                                items={visibleColumns.map((c) => `col-${c.id}`)}
                                strategy={horizontalListSortingStrategy}
                              >
                                {visibleColumns.map((col) => (
                                  <SortableColumnHeader
                                    key={col.id}
                                    column={col}
                                    width={getColumnWidth(col.id, col.type)}
                                    onWidthChange={(w) => onColumnWidthChange(col.id, w)}
                                    onWidthCommit={(w) => onColumnWidthCommit(col.id, w)}
                                    onWidthReset={() => onColumnWidthReset(col.id, col.type)}
                                    onSaveEdit={(newName) => onSaveColumnName(col.id, newName)}
                                    onDelete={() => onDeleteColumn(col.id)}
                                    onToggleMinimize={() => onToggleMinimizeColumn(col.id, g.id)}
                                    onAddRight={() => onAddColumnRight(col.id)}
                                    isCollapsed={collapsedColIds.has(col.id)}
                                  />
                                ))}
                              </SortableContext>

                              {/* Add column button */}
                              <th className="px-4 py-2">
                                <button
                                  onClick={() => setShowAddColumnModal(true)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-rf-ink-100 bg-rf-surface-card text-rf-ink-500 hover:bg-rf-surface-page hover:text-rf-text-primary transition"
                                  title="Add column"
                                >
                                  +
                                </button>
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {rows.length === 0 ? (
                              <tr>
                                <td colSpan={visibleColumns.length + 2} className="px-4 py-8 text-sm text-rf-text-muted text-center">
                                  No applicants in this group yet.
                                </td>
                              </tr>
                            ) : (
                              <SortableContext
                                items={rows.map((r) => `row-${r.id}`)}
                                strategy={verticalListSortingStrategy}
                              >
                                {rows.map((a) => (
                                  <SortableRow
                                    key={a.id}
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
                                    onDelete={() => onDeleteApplicant(a.id)}
                                    companyId={companyId}
                                    boardId={boardId}
                                    fadvReady={fadvReadyApplicantIds.has(a.id)}
                                    onSendToFadv={async () => {
                                      const r = await sendToFadv(companyId, jobId, a.id);
                                      if (!r.success) alert(`FADV: ${r.error}`);
                                      else alert(`Sent to First Advantage${r.subjectId ? ` (ID: ${r.subjectId})` : ""}`);
                                    }}
                                    collapsedColumnIds={collapsedColIds}
                                  />
                                ))}
                              </SortableContext>
                            )}

                            {/* "+ Add item" row - Monday.com style inline creation */}
                            <tr
                              onClick={() => onQuickCreateApplicant(g.id)}
                              className="border-t border-rf-border hover:bg-rf-blue-tint/30 cursor-pointer transition-colors group/addrow"
                            >
                              <td className="sticky left-0 z-10 bg-rf-surface-card group-hover/addrow:bg-rf-blue-tint/30 px-4 py-3 border-r border-rf-ink-100">
                                <div className="flex items-center gap-2 text-rf-text-muted group-hover/addrow:text-rf-blue transition-colors">
                                  <span className="text-sm font-semibold">+</span>
                                </div>
                              </td>
                              <td colSpan={visibleColumns.length + 1} className="px-4 py-3">
                                <span className="text-sm text-rf-text-muted group-hover/addrow:text-rf-blue font-medium transition-colors">
                                  Add item
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )})()}
                    </section>
                  );
                })}
              </SortableContext>

              {/* No results — desktop */}
              {(!!searchQuery || (activeFilters ?? []).length > 0) &&
                localGroups.every((g) => (applicantsByGroup.get(g.id) ?? []).length === 0) &&
                !(applicantsByGroup.has('__orphaned__') && (applicantsByGroup.get('__orphaned__') ?? []).length > 0) && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <p className="text-rf-ink-700 font-medium">No results found</p>
                    <p className="text-rf-text-muted text-sm mt-1">Try adjusting your search or filters</p>
                  </div>
                )}

              {/* Render orphaned applicants group if it exists */}
              {applicantsByGroup.has('__orphaned__') && (() => {
                const orphanedRows = applicantsByGroup.get('__orphaned__') ?? [];
                return (
                  <section key="__orphaned__" className="space-y-2">
                    {/* Orphaned group header with warning styling */}
                    <div className="flex items-center gap-3 px-2 bg-rf-danger-bg border border-red-200 rounded-lg p-3">
                      <div className="h-4 w-4 rounded" style={{ backgroundColor: '#ef4444' }} />
                      <h2 className="text-base font-semibold text-red-900">⚠️ Orphaned Applicants</h2>
                      <span className="text-sm text-rf-danger">({orphanedRows.length})</span>
                      <span className="text-xs text-rf-danger ml-auto">
                        Board mismatch - check console for details
                      </span>
                    </div>

                    {/* Orphaned group table */}
                    <div className="overflow-visible rounded-lg border-2 border-red-300 bg-rf-danger-bg/30">
                      <div className="bg-red-100 p-3 text-sm text-rf-danger border-b border-red-200">
                        <strong>⚠️ Warning:</strong> These applicants have group_ids that don't match any group in the current board.
                        This usually means multiple boards exist for this job. Check the browser console for diagnostic information.
                      </div>
                      <table className="w-full text-left border-collapse bg-rf-surface-card">
                        <thead className="bg-rf-surface-page/80">
                          <tr className="border-b border-rf-border">
                            <th className="sticky left-0 z-20 w-10 bg-rf-surface-page/80 px-4 py-2"></th>
                            {visibleColumns.map((col) => (
                              <th key={col.id} className="px-4 py-2 text-xs font-medium text-rf-ink-700 border-r border-rf-border">
                                {col.name}
                              </th>
                            ))}
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {orphanedRows.map((a) => (
                            <SortableRow
                              key={a.id}
                              applicant={a}
                              columns={localColumns}
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
                              onDelete={() => onDeleteApplicant(a.id)}
                              companyId={companyId}
                              boardId={boardId}
                              fadvReady={fadvReadyApplicantIds.has(a.id)}
                              onSendToFadv={async () => {
                                const r = await sendToFadv(companyId, jobId, a.id);
                                if (!r.success) alert(`FADV: ${r.error}`);
                                else alert(`Sent to First Advantage${r.subjectId ? ` (ID: ${r.subjectId})` : ""}`);
                              }}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })()}

              {/* Add new group — subtle Monday-style */}
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
            </div>
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

// ===== Applicant Detail Panel =====

function ApplicantDetailPanel({
  applicant,
  group,
  columns,
  cells,
  labelsByColumn,
  onClose,
}: {
  applicant: { id: string; full_name: string; email: string; group_id: string | null };
  group: Group | undefined;
  columns: BoardColumn[];
  cells: BoardCell[];
  labelsByColumn: Map<string, StatusLabel[]>;
  onClose: () => void;
}) {
  const appCells = cells.filter((c) => c.applicant_id === applicant.id);

  return (
    <div className="fixed inset-0 z-[900] flex" role="dialog" aria-modal="true" aria-label={`Details for ${applicant.full_name}`}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="w-96 max-w-full bg-rf-surface-card shadow-2xl border-l border-rf-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-rf-ink-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-rf-text-primary truncate">{applicant.full_name || "Applicant"}</h2>
          <button
            onClick={onClose}
            aria-label="Close detail panel"
            className="p-1.5 rounded-lg hover:bg-rf-surface-page text-rf-text-muted hover:text-rf-ink-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stage */}
        {group && (
          <div className="px-5 py-2.5 border-b border-rf-ink-100 flex items-center gap-2 shrink-0">
            <span className="text-xs text-rf-text-muted font-medium">Stage</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: group.color }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
              {group.name}
            </span>
          </div>
        )}

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {columns.filter((col) => !col.is_hidden).map((col) => {
            const cell = appCells.find((c) => c.column_id === col.id);
            const labels = labelsByColumn.get(col.id) ?? [];

            if (col.type === "status") {
              const label = labels.find((l) => l.id === cell?.value_status_label_id);
              return (
                <div key={col.id}>
                  <p className="text-xs font-medium text-rf-text-muted mb-1">{col.name}</p>
                  {label ? (
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                      <span className="text-sm text-rf-ink-700">{label.label}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-rf-text-muted">—</span>
                  )}
                </div>
              );
            }

            let displayValue: string | null = null;
            if (col.type === "text" || col.type === "email" || col.type === "phone" || col.type === "location") {
              displayValue = cell?.value_text ?? null;
            } else if (col.type === "number") {
              displayValue = cell?.value_number != null ? String(cell.value_number) : null;
            } else if (col.type === "date") {
              displayValue = cell?.value_date ? new Date(cell.value_date).toLocaleDateString() : null;
            }

            return (
              <div key={col.id}>
                <p className="text-xs font-medium text-rf-text-muted mb-1">{col.name}</p>
                <p className="text-sm text-rf-ink-700 break-words">{displayValue ?? <span className="text-rf-text-muted">—</span>}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== Sortable Column Header =====

function SortableColumnHeader({
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
}) {
  // Local edit state - matches CellRenderer pattern exactly
  const [localValue, setLocalValue] = useState(column.name);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCollapsed = isCollapsedProp ?? column.settings?.ui?.collapsed ?? false;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-${column.id}`,
    // Disable when editing, collapsed, or for system columns (system columns were never reorderable)
    disabled: isEditing || isCollapsed || column.is_system,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
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

  // Calculate menu position when it opens — flip upward if not enough space below
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
    <th
      ref={setNodeRef}
      style={{ ...style, position: 'relative' }}
      className={`group py-2 text-sm font-medium text-rf-ink-700 border-r border-rf-border last:border-r-0 ${
        isCollapsed ? "px-0 w-8" : "px-3"
      }${!isEditing && !isCollapsed && !column.is_system ? " cursor-grab active:cursor-grabbing" : ""}`}
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
          {/* Instant tooltip — drops below header so it's never clipped by thead overflow */}
          <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-rf-ink-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/collapsed:opacity-100 z-[200]">
            Expand &ldquo;{column.name}&rdquo;
          </div>
        </div>
      ) : (
        <div className="flex items-center w-full min-w-0">
          {isEditing ? (
            // DRAG EXCLUSION: editing input — onPointerDown/onMouseDown stop events reaching <th> drag listeners
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
              {/* DRAG EXCLUSION — title only: shrinks to text width so most header background stays drag zone */}
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

              {/* DRAG EXCLUSION — kebab at far right: stopPropagation prevents <th> listeners from activating drag */}
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

            {/* Section 1 — layout actions */}
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

            {/* Section 2 — edit actions */}
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

            {/* Section 3 — danger */}
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
    </th>
  );
}

// ===== Sortable Row =====

function SortableRow({
  applicant,
  columns,
  selected,
  onToggle,
  getCellValue,
  onUpdateCell,
  labelsByColumn,
  onEditLabels,
  rowMenuOpen,
  setRowMenuOpen,
  groups,
  onOpen,
  onMove,
  onDuplicate,
  onDelete,
  companyId,
  boardId,
  fadvReady = false,
  onSendToFadv,
  collapsedColumnIds = new Set(),
}: {
  applicant: ApplicantRow;
  columns: BoardColumn[];
  selected: boolean;
  onToggle: () => void;
  getCellValue: (col: BoardColumn) => any;
  onUpdateCell: (colId: string, colType: "text" | "number" | "date" | "status" | "checkbox" | "email" | "phone" | "location" | "file" | "fadv.package" | "fadv.location" | "fadv.facility_id" | "fadv.position_type", val: any) => void;
  labelsByColumn: Map<string, StatusLabel[]>;
  onEditLabels: (colId: string) => void;
  rowMenuOpen: boolean;
  setRowMenuOpen: (open: boolean) => void;
  groups: Group[];
  onOpen: () => void;
  onMove: (groupId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  companyId: string;
  boardId: string;
  fadvReady?: boolean;
  onSendToFadv?: () => Promise<void>;
  collapsedColumnIds?: Set<string>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `row-${applicant.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);

  const cellEls: React.ReactNode[] = [];

  // Calculate menu position when it opens — flip upward if not enough space below
  useEffect(() => {
    if (rowMenuOpen && menuButtonRef.current) {
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
  }, [rowMenuOpen]);

  // Sticky left cell (checkbox + row menu + FADV badge)
  cellEls.push(
    <td
      key="__sticky__"
      className="sticky left-0 z-10 bg-rf-surface-card group-hover:bg-rf-surface-page/60 px-4 py-2 border-r border-rf-ink-100"
    >
      <div className="flex items-center gap-2">
        {fadvReady && (
          <span
            className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rf-blue-tint text-rf-blue border border-rf-blue-tint whitespace-nowrap"
            title="All FADV fields set — ready to submit"
          >
            ✓ FADV
          </span>
        )}
        <div className="relative">
          <button
            ref={menuButtonRef}
            onClick={() => setRowMenuOpen(!rowMenuOpen)}
            className="opacity-0 group-hover:opacity-100 text-rf-text-muted hover:text-rf-ink-700 transition text-sm"
            aria-label="Row options"
          >
            ⋮
          </button>
          {/* Render menu in a portal to escape table overflow/z-index issues */}
          {rowMenuOpen && menuPosition && typeof window !== 'undefined' && createPortal(
            <>
              {/* Backdrop to close menu when clicking outside */}
              <div
                className="fixed inset-0 z-[998]"
                onClick={() => setRowMenuOpen(false)}
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
                {/* Applicant name header */}
                <div className="px-4 py-3 border-b border-rf-ink-100 bg-rf-surface-page">
                  <p className="text-xs font-semibold text-rf-text-secondary uppercase tracking-wider truncate">
                    {applicant.full_name ?? "Applicant"}
                  </p>
                </div>

                {/* Open detail panel */}
                <div className="py-2 border-b border-rf-ink-100">
                  <button
                    onClick={() => { setRowMenuOpen(false); onOpen(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                  >
                    <ExternalLink className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                    Open
                  </button>
                </div>

                {/* Section 1 — Move to */}
                <div className="py-2">
                  <p className="px-4 py-1.5 text-xs font-semibold text-rf-text-muted uppercase tracking-wider">Move to</p>
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => { onMove(g.id); setRowMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                      {g.name}
                    </button>
                  ))}
                </div>

                <div className="border-t border-rf-ink-100" />

                {/* Section 2 — actions */}
                <div className="py-2">
                  <button
                    onClick={() => { setRowMenuOpen(false); onDuplicate(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                  >
                    <Copy className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                    Duplicate
                  </button>
                  {onSendToFadv && (
                    <button
                      onClick={() => { setRowMenuOpen(false); onSendToFadv(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-blue hover:bg-rf-blue-tint transition-colors text-left"
                    >
                      <Send className="w-4 h-4 flex-shrink-0" />
                      Send to FADV
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setRowMenuOpen(false);
                      window.location.href = `/dashboard/${companyId}/applicants/${applicant.id}/training`;
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                  >
                    <GraduationCap className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                    Training Progress
                  </button>
                  {applicant.portal_token && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/status/${applicant.portal_token}`
                        );
                        setRowMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
                    >
                      <Link2 className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                      Copy status link
                    </button>
                  )}
                </div>

                <div className="border-t border-rf-ink-100" />

                {/* Section 3 — danger */}
                <div className="py-2">
                  <button
                    onClick={() => { setRowMenuOpen(false); onDelete(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-danger hover:bg-rf-danger-bg transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4 flex-shrink-0" />
                    Delete
                  </button>
                </div>
              </div>
            </>,
            document.body
          )}
        </div>

        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 rounded border-rf-ink-100"
        />

        <button
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-rf-text-muted hover:text-rf-ink-500 text-xs opacity-0 group-hover:opacity-100"
          aria-label="Drag to reorder row"
        >
          ⋮⋮
        </button>
      </div>
    </td>
  );

  // Dynamic board columns
  for (const col of columns) {
    const isCollapsed = collapsedColumnIds.has(col.id);
    cellEls.push(
      <td
        key={col.id}
        className={`py-2 border-r border-rf-ink-100 last:border-r-0 relative ${isCollapsed ? "px-1 w-12" : "px-4"}`}
      >
        <CellRenderer
          applicant={applicant}
          column={col}
          value={getCellValue(col)}
          labels={labelsByColumn.get(col.id) ?? []}
          onUpdate={(val) => onUpdateCell(col.id, col.type as any, val)}
          onEditLabels={() => onEditLabels(col.id)}
          companyId={companyId}
          boardId={boardId}
          isCollapsed={isCollapsed}
        />
      </td>
    );
  }

  // Empty cell for + button column
  cellEls.push(<td key="__plus__" className="px-4 py-2" />);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="group border-b border-rf-ink-100 hover:bg-rf-surface-page/60 relative"
      {...attributes}
    >
      {cellEls}
    </tr>
  );
}

// ===== Sortable Group Header =====

function SortableGroupHeader({
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
    // Left color strip — shows both in-flow and while sticky.
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

  // Calculate menu position when it opens — flip upward if not enough space below
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
      className={`group flex items-center gap-3 px-5 py-3.5 bg-rf-surface-card
        rounded-t-[14px] border-b border-rf-ink-100
        sticky top-0 z-30
        ${isDragging ? "" : "shadow-[0_1px_0_0_rgb(0,0,0,0.04)]"}`}
      {...attributes}
    >
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

      {/* Inline editable name — color matches group color */}
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

      {/* Color picker portal — only while rename mode is active (skip until positioned) */}
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

            {/* Section 1 — column visibility */}
            <div className="py-2">
              {/* Collapsible "Columns" accordion header */}
              <button
                onClick={() => setShowColumnsSection((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
              >
                <Eye className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                <span className="flex-1 font-medium">Columns</span>
                {allColumns.filter((c) => !c.is_system && c.is_hidden).length > 0 && (
                  <span className="text-[10px] font-semibold bg-rf-blue-tint text-rf-blue rounded-full px-1.5 py-0.5 leading-none">
                    {allColumns.filter((c) => !c.is_system && c.is_hidden).length} hidden
                  </span>
                )}
                <span className="text-xs text-rf-text-muted ml-1">{showColumnsSection ? "▲" : "▼"}</span>
              </button>

              {/* Expanded: per-column checkboxes */}
              {showColumnsSection && (
                <div className="pb-1">
                  {allColumns.filter((col) => !col.is_system).map((col) => (
                    <label
                      key={col.id}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-rf-ink-700 hover:bg-rf-surface-page cursor-pointer"
                    >
                      {col.is_hidden ? (
                        <EyeOff className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                      ) : (
                        <Eye className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                      )}
                      <span className={col.is_hidden ? "text-rf-text-muted" : ""}>{col.name}</span>
                      <input
                        type="checkbox"
                        checked={!col.is_hidden}
                        onChange={() => col.is_hidden ? onShowColumn(col.id) : onHideColumn(col.id)}
                        className="ml-auto h-4 w-4 rounded border-rf-ink-100 text-rf-blue cursor-pointer"
                      />
                    </label>
                  ))}
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
            </div>

            <div className="border-t border-rf-ink-100" />

            {/* Section 2 — edit */}
            <div className="py-2">
              <button
                onClick={onRename}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rf-ink-700 hover:bg-rf-surface-page transition-colors text-left"
              >
                <PencilLine className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
                Rename
              </button>
            </div>

            {/* Section 3 — applicant portal settings */}
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
                    placeholder="Note shown to applicants at this step…"
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
                                ×
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

// ===== FileCell =====
//
// Monday-style file column cell with:
//   • Hover-only paperclip affordance when empty
//   • Immediate file picker on click (no dropdown)
//   • Inline uploading spinner
//   • Filled: file-type icon + truncated name, hover shows replace/remove
//   • Preview modal: image/PDF inline, download fallback
//   • Drag-and-drop and Cmd/Ctrl+V paste support
//   • ARIA keyboard accessible
//
// The hidden <input type="file"> is always in the DOM (never conditionally
// rendered) to avoid hydration mismatches and SSR issues.

type StoredFile = {
  id: string;        // stable key — uuid or path for legacy records
  name: string;      // original filename
  path: string;      // supabase storage path
  bucket: string;    // always "files"
  type: string;      // MIME type
  size: number;      // bytes
  createdAt: string; // ISO timestamp
};

// Tiny inline SVG icons — one per file-type family.
function FileSvgIcon({ type }: { type: string }) {
  // PDF
  if (type === "application/pdf")
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-danger" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    );
  // Word / DOC / DOCX
  if (type.includes("word") || type.includes("msword"))
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-blue" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    );
  // Excel / CSV / Sheets
  if (type.includes("sheet") || type.includes("excel") || type === "text/csv")
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-success" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd" />
      </svg>
    );
  // Images
  if (type.startsWith("image/"))
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-blue" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    );
  // Generic
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-rf-text-muted" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  );
}

// ===== FileViewer =====
// Full-screen carousel viewer for one or more StoredFile items.
// Fetches short-lived signed URLs on demand, caches them in a ref.

function FileViewer({
  files,
  initialIndex,
  onClose,
  onDelete,
}: {
  files: StoredFile[];
  initialIndex: number;
  onClose: () => void;
  onDelete: (fileId: string) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({});
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [zoom, setZoom] = useState(1);

  const current = files[index];

  // Fetch a signed URL for a given file path (cached in state)
  async function fetchSignedUrl(file: StoredFile) {
    if (signedUrls[file.id] !== undefined) return; // already fetched or failed
    setLoadingUrl(true);
    try {
      const params = new URLSearchParams({ path: file.path, bucket: file.bucket || "files" });
      const res = await fetch(`/api/board/signed-url?${params}`);
      const data = await res.json();
      setSignedUrls((prev) => ({ ...prev, [file.id]: res.ok ? data.url : null }));
    } catch {
      setSignedUrls((prev) => ({ ...prev, [file.id]: null }));
    } finally {
      setLoadingUrl(false);
    }
  }

  // Fetch URL whenever current file changes; prefetch adjacent files
  useEffect(() => {
    if (!current) return;
    setZoom(1); // reset zoom on file change
    fetchSignedUrl(current);
    if (files[index + 1]) fetchSignedUrl(files[index + 1]);
    if (files[index - 1]) fetchSignedUrl(files[index - 1]);
  }, [index, files.length]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < files.length - 1) setIndex((i) => i + 1);
      if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, files.length, onClose]);

  const url = current ? signedUrls[current.id] : undefined;
  const isImage = current?.type.startsWith("image/") ?? false;
  const isPDF = current?.type === "application/pdf";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between border-b border-white/10 bg-black/60 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* File name + count */}
        <div className="flex min-w-0 items-center gap-2">
          {current && <FileSvgIcon type={current.type} />}
          <span className="truncate text-sm font-medium text-white">{current?.name ?? "File"}</span>
          {files.length > 1 && (
            <span className="ml-1 flex-shrink-0 rounded bg-rf-surface-card/10 px-1.5 py-0.5 text-xs text-white/60">
              {index + 1} / {files.length}
            </span>
          )}
        </div>

        {/* Action bar */}
        <div className="ml-4 flex flex-shrink-0 items-center gap-1">
          {/* Zoom (images only) */}
          {isImage && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
                title="Zoom out"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
                title="Zoom in"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </button>
              {zoom !== 1 && (
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="rounded px-2 py-1 text-xs text-white/60 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
              )}
              <div className="mx-1 h-4 w-px bg-rf-surface-card/20" />
            </>
          )}
          {/* Print */}
          {url && (
            <button
              type="button"
              onClick={() => {
                const win = window.open(url, "_blank");
                win?.print();
              }}
              className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
              title="Print"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </button>
          )}
          {/* Download */}
          {url && (
            <a
              href={url}
              download={current?.name}
              className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
              title="Download"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
          )}
          {/* Delete */}
          {current && (
            <button
              type="button"
              onClick={() => {
                onDelete(current.id);
                // If last file, close viewer; else advance index
                if (files.length === 1) {
                  onClose();
                } else {
                  setIndex((i) => Math.min(i, files.length - 2));
                }
              }}
              className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-danger/80 hover:text-white"
              title="Delete file"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <div className="mx-1 h-4 w-px bg-rf-surface-card/20" />
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prev arrow */}
        {index > 0 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            className="absolute left-3 z-10 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
            aria-label="Previous file"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* File preview */}
        <div className="flex h-full w-full items-center justify-center p-4">
          {loadingUrl && !url ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          ) : url === null ? (
            <div className="flex flex-col items-center gap-4 text-white/60">
              <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">Unable to load file preview</p>
            </div>
          ) : isImage ? (
            <img
              src={url}
              alt={current?.name}
              style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.15s" }}
              className="max-h-[80vh] max-w-full object-contain"
            />
          ) : isPDF ? (
            <iframe src={url} className="h-[80vh] w-full max-w-4xl rounded" title={current?.name} />
          ) : (
            <div className="flex flex-col items-center gap-4">
              {current && <FileSvgIcon type={current.type} />}
              <p className="text-sm text-white/60">Preview not available for this file type.</p>
              <a
                href={url}
                download={current?.name}
                className="rounded-lg bg-rf-surface-card px-4 py-2 text-sm font-medium text-rf-text-primary transition-colors hover:bg-rf-surface-page"
              >
                Download {current?.name}
              </a>
            </div>
          )}
        </div>

        {/* Next arrow */}
        {index < files.length - 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className="absolute right-3 z-10 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
            aria-label="Next file"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Film strip dots (if multiple files) */}
      {files.length > 1 && (
        <div
          className="flex flex-shrink-0 items-center justify-center gap-1.5 border-t border-white/10 bg-black/60 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-5 bg-rf-surface-card" : "w-2 bg-rf-surface-card/30 hover:bg-rf-surface-card/60"
              }`}
              aria-label={`Go to file ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

// ===== FileCell =====
//
// Monday-style multi-file cell:
//   • Empty: hover shows paperclip affordance, click opens file picker
//   • 1 file: icon + truncated name; hover shows "+ Add" button
//   • N files: first file icon + name + "+N" count badge; hover shows "+ Add"
//   • Upload appends to the array (never overwrites)
//   • Opens FileViewer on click for preview / delete / download / print
//   • Drag-and-drop and Cmd/Ctrl+V paste append additional files
//   • Hidden <input> always in DOM (no SSR/hydration issues)

function FileCell({
  applicant,
  column,
  value,
  companyId,
  boardId,
  onUpdate,
}: {
  applicant: ApplicantRow;
  column: BoardColumn;
  value: StoredFile[] | null;
  companyId: string;
  boardId: string;
  onUpdate: (val: any) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<StoredFile[]>(value ?? []);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync from server when parent propagates a change
  useEffect(() => {
    setLocalFiles(value ?? []);
  }, [value]);

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleFileSelect(file: File) {
    setUploading(true);
    setUploadError(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("companyId", companyId);
    fd.append("boardId", boardId);
    fd.append("columnId", column.id);
    fd.append("applicantId", applicant.id);

    try {
      const res = await fetch("/api/board/upload-file", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Upload failed");

      const newFile: StoredFile = {
        id: crypto.randomUUID(),
        name: data.metadata?.name ?? file.name,
        path: data.path,
        bucket: "files",
        type: data.metadata?.type ?? file.type,
        size: data.metadata?.size ?? file.size,
        createdAt: new Date().toISOString(),
      };

      const next = [...localFiles, newFile];
      setLocalFiles(next);
      onUpdate(next);
      setUploadError(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
      e.target.value = ""; // reset so same file can be re-selected
    }
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  // ── Delete (from FileViewer) ───────────────────────────────────────────────

  function handleDelete(fileId: string) {
    const next = localFiles.filter((f) => f.id !== fileId);
    setLocalFiles(next);
    onUpdate(next.length > 0 ? next : []);
  }

  // ── Drag-and-drop ─────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  // ── Paste ─────────────────────────────────────────────────────────────────

  function handlePaste(e: React.ClipboardEvent) {
    const fileItem = Array.from(e.clipboardData.items).find((i) => i.kind === "file");
    if (!fileItem) return;
    e.preventDefault();
    const file = fileItem.getAsFile();
    if (file) handleFileSelect(file);
  }

  // Hidden file input — always in DOM
  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      className="sr-only"
      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.txt,.json,.html"
      onChange={handleInputChange}
      tabIndex={-1}
      aria-hidden="true"
    />
  );

  const firstFile = localFiles[0];
  const extraCount = localFiles.length - 1;

  // ── Uploading ─────────────────────────────────────────────────────────────

  if (uploading) {
    return (
      <div className="flex h-8 w-full items-center gap-2 px-1">
        {hiddenInput}
        <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-rf-border border-t-blue-500" />
        <span className="truncate text-xs text-rf-text-secondary">Uploading…</span>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (localFiles.length === 0) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload file"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={`group/fcell relative flex h-8 w-full cursor-pointer items-center rounded px-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue ${
          isDragOver ? "bg-rf-blue-tint ring-1 ring-inset ring-blue-300" : "hover:bg-rf-surface-page"
        }`}
      >
        {hiddenInput}
        <svg
          className={`h-4 w-4 text-rf-text-muted transition-opacity ${
            isDragOver ? "opacity-100" : "opacity-0 group-hover/fcell:opacity-100 group-focus/fcell:opacity-100"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        {uploadError && (
          <span className="ml-1 truncate text-xs text-rf-danger" title={uploadError}>{uploadError}</span>
        )}
      </div>
    );
  }

  // ── Filled state ──────────────────────────────────────────────────────────

  return (
    <div
      className={`group/fcell relative flex h-8 w-full items-center gap-1 rounded px-1 transition-colors ${
        isDragOver ? "bg-rf-blue-tint ring-1 ring-inset ring-blue-300" : "hover:bg-rf-surface-page"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {hiddenInput}

      {/* First file icon + name — clicking opens viewer at index 0 */}
      <button
        type="button"
        onClick={() => { setViewerIndex(0); setViewerOpen(true); }}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={firstFile.name}
      >
        <FileSvgIcon type={firstFile.type} />
        <span className="truncate text-xs text-rf-ink-700">{firstFile.name}</span>
        {extraCount > 0 && (
          <span className="ml-0.5 flex-shrink-0 rounded bg-rf-ink-100 px-1 py-0.5 text-[10px] font-medium leading-none text-rf-ink-500">
            +{extraCount}
          </span>
        )}
      </button>

      {/* Hover actions */}
      <div className="flex flex-shrink-0 items-center opacity-0 transition-opacity group-hover/fcell:opacity-100">
        {/* Add more */}
        <button
          type="button"
          onClick={openPicker}
          className="rounded p-0.5 text-rf-text-muted transition-colors hover:bg-rf-ink-100 hover:text-rf-ink-700"
          title="Add file"
          aria-label="Add file"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {uploadError && (
        <span className="ml-1 flex-shrink-0 text-xs text-rf-danger" title={uploadError}>!</span>
      )}

      {/* File viewer */}
      {viewerOpen && (
        <FileViewer
          files={localFiles}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// ===== Cell Renderer =====

function CellRenderer({
  applicant,
  column,
  value,
  labels,
  onUpdate,
  onEditLabels,
  companyId,
  boardId,
  isCollapsed: isCollapsedProp,
}: {
  applicant: ApplicantRow;
  column: BoardColumn;
  value: any;
  labels: StatusLabel[];
  onUpdate: (val: any) => void;
  onEditLabels: () => void;
  companyId?: string;
  boardId?: string;
  isCollapsed?: boolean;
}) {
  // All hooks must be declared unconditionally before any early returns
  const [isPending, startTransition] = useTransition();
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const [showExpanded, setShowExpanded] = useState(false);

  // Update local value when prop changes (from server)
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value);
    }
  }, [value, isEditing]);

  // Per-group collapsed state takes priority; fall back to legacy column-level setting
  const isCollapsed = isCollapsedProp ?? column.settings?.ui?.collapsed ?? false;
  if (isCollapsed) {
    return <span className="text-xs text-rf-text-muted">—</span>;
  }

  // Commit the edit to server
  const commitEdit = () => {
    if (localValue !== value) {
      if (VERBOSE) console.log('[CellRenderer] Committing edit:', {
        applicantId: applicant.id,
        columnId: column.id,
        columnName: column.name,
        oldValue: value,
        newValue: localValue,
      });
      startTransition(() => onUpdate(localValue));
    }
    setIsEditing(false);
  };

  // Cancel edit and revert to original value
  const cancelEdit = () => {
    setLocalValue(value);
    setIsEditing(false);
  };

  // Handle keyboard shortcuts
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

  if (column.is_system) {
    if (column.type === "text") {
      return <span className="text-sm text-rf-ink-700 truncate" title={value || undefined}>{value || "—"}</span>;
    }
    if (column.type === "status") {
      const selectedLabel = labels.find((l) => l.label.toLowerCase() === value?.toLowerCase());
      return (
        <div className="flex items-center gap-2">
          {selectedLabel && (
            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: selectedLabel.color }} />
          )}
          <span className="text-sm text-rf-ink-700 truncate" title={value || undefined}>{value || "—"}</span>
        </div>
      );
    }
    return <span className="text-sm text-rf-ink-700 truncate" title={value || undefined}>{value || "—"}</span>;
  }

  if (column.type === "text") {
    const isLong = (localValue?.length ?? 0) > 100;
    return (
      <div className="relative group/textcell">
        <input
          type="text"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-border focus:border-rf-blue"
          placeholder="—"
          title={!isLong ? (localValue || undefined) : undefined}
        />
        {/* Expand button — shown on hover for long text values */}
        {isLong && !isPending && (
          <button
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowExpanded(true); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/textcell:opacity-100 transition-opacity p-0.5 rounded text-rf-text-muted hover:text-rf-blue hover:bg-rf-blue-tint"
            title="View full text"
            tabIndex={-1}
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        )}
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
        {/* Full-text modal for long values */}
        {showExpanded && isLong && typeof window !== 'undefined' && createPortal(
          <>
            <div className="fixed inset-0 z-[998] bg-black/30" onClick={() => setShowExpanded(false)} />
            <div className="fixed z-[999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-h-[70vh] rounded-xl border border-rf-border bg-rf-surface-card shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-rf-ink-100 shrink-0">
                <p className="text-sm font-semibold text-rf-text-primary">{column.name}</p>
                <button
                  onClick={() => setShowExpanded(false)}
                  className="text-rf-text-muted hover:text-rf-text-primary transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <p className="text-sm text-rf-ink-700 whitespace-pre-wrap leading-relaxed">{localValue}</p>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  }

  if (column.type === "number") {
    return (
      <div className="relative">
        <input
          type="number"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value ? parseFloat(e.target.value) : null)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-border focus:border-rf-blue"
          placeholder="—"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  if (column.type === "date") {
    return (
      <div className="relative">
        <input
          type="date"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-border focus:border-rf-blue"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  if (column.type === "status") {
    return (
      <StatusDropdown
        value={value}
        labels={labels}
        onChange={(val) => startTransition(() => onUpdate(val))}
        onEditLabels={onEditLabels}
      />
    );
  }

  if (column.type === "email") {
    return <EmailCell value={value} onUpdate={onUpdate} />;
  }

  if (column.type === "phone") {
    return <PhoneCell value={value} onUpdate={onUpdate} />;
  }

  if (column.type === "location") {
    return (
      <div className="relative">
        <input
          type="text"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-border focus:border-rf-blue"
          placeholder="City, State"
          title={localValue || undefined}
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  if (
    column.type === "fadv.package" ||
    column.type === "fadv.location" ||
    column.type === "fadv.facility_id" ||
    column.type === "fadv.position_type"
  ) {
    const placeholders: Record<string, string> = {
      "fadv.package":       "e.g. STANDARD",
      "fadv.location":      "e.g. Chicago",
      "fadv.facility_id":   "e.g. FAC001",
      "fadv.position_type": "e.g. Driver",
    };
    return (
      <div className="relative">
        <input
          type="text"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-rf-blue-tint focus:border-rf-blue bg-rf-blue-tint/30"
          placeholder={placeholders[column.type] ?? "—"}
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  // CHECKBOX TYPE — boolean toggle (like Monday's checkbox column)
  if (column.type === "checkbox") {
    const checked = Boolean(value);
    return (
      <button
        type="button"
        onClick={() => startTransition(() => onUpdate(!checked))}
        className="flex h-8 w-full items-center justify-center"
        aria-label={checked ? "Uncheck" : "Check"}
      >
        <div
          className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
            checked
              ? "bg-rf-success"
              : "border-2 border-rf-ink-100 hover:border-rf-ink-300 bg-rf-surface-card"
          }`}
        >
          {checked && (
            <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,6 5,9 10,3" />
            </svg>
          )}
        </div>
        {isPending && (
          <div className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-green-500" />
        )}
      </button>
    );
  }

  if (column.type === "file") {
    return (
      <FileCell
        applicant={applicant}
        column={column}
        value={value}
        companyId={companyId ?? ""}
        boardId={boardId ?? ""}
        onUpdate={onUpdate}
      />
    );
  }

  return <span className="text-rf-text-muted">—</span>;
}

// ===== Email Cell — validates before saving, shows inline error =====

function EmailCell({
  value,
  onUpdate,
}: {
  value: string | null;
  onUpdate: (val: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [localValue, setLocalValue] = useState<string>(value ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync from server when not editing
  useEffect(() => {
    if (!isEditing) setLocalValue(value ?? "");
  }, [value, isEditing]);

  const commitEmailEdit = () => {
    const raw = localValue.trim();

    // Allow clearing the field
    if (!raw) {
      setIsEditing(false);
      setError(null);
      if (value) startTransition(() => onUpdate(null));
      return;
    }

    const { valid, error: errMsg } = validateEmail(raw);
    if (!valid) {
      setError(errMsg ?? "Invalid email address");
      // Keep focus so user can fix the value
      return;
    }

    setError(null);
    setIsEditing(false);
    if (raw !== value) {
      startTransition(() => onUpdate(raw));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEmailEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setLocalValue(value ?? "");
      setError(null);
      setIsEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="relative">
      <input
        type="email"
        value={localValue}
        onChange={(e) => { setLocalValue(e.target.value); setError(null); }}
        onFocus={() => { setIsEditing(true); setLocalValue(value ?? ""); }}
        onBlur={commitEmailEdit}
        onKeyDown={handleKeyDown}
        className={`h-8 w-full rounded border px-2 text-[16px] md:text-sm outline-none transition-colors hover:border-rf-border focus:border-rf-blue ${
          error ? "border-red-400 bg-rf-danger-bg focus:border-red-500" : "border-transparent"
        }`}
        placeholder="email@example.com"
        title={!isEditing && value ? value : undefined}
      />
      {error && (
        <div className="absolute left-0 top-full z-10 mt-0.5 rounded border border-red-200 bg-rf-danger-bg px-2 py-1 text-xs text-red-700 shadow-sm whitespace-nowrap pointer-events-none">
          {error}
        </div>
      )}
      {isPending && !error && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
        </div>
      )}
    </div>
  );
}

// ===== Phone Cell — E.164-aware input with inline validation =====

function PhoneCell({
  value,
  onUpdate,
}: {
  value: string | null;
  onUpdate: (val: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [localValue, setLocalValue] = useState<string>(value ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync from server when not editing
  useEffect(() => {
    if (!isEditing) setLocalValue(value ?? "");
  }, [value, isEditing]);

  const commitPhoneEdit = () => {
    const raw = localValue.trim();

    // Allow clearing the field
    if (!raw) {
      setIsEditing(false);
      setError(null);
      if (value) startTransition(() => onUpdate(null));
      return;
    }

    const { valid, normalized, error: errMsg } = validatePhone(raw);
    if (!valid) {
      setError(errMsg ?? "Invalid phone number");
      // Keep focus — user must fix before closing
      return;
    }

    setError(null);
    setIsEditing(false);
    if (normalized !== value) {
      startTransition(() => onUpdate(normalized!));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitPhoneEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setLocalValue(value ?? "");
      setError(null);
      setIsEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="relative">
      <input
        type="tel"
        value={isEditing ? localValue : (value ? formatPhone(value) : "")}
        onChange={(e) => {
          setLocalValue(e.target.value);
          setError(null);
        }}
        onFocus={() => {
          setIsEditing(true);
          setLocalValue(value ?? "");
        }}
        onBlur={commitPhoneEdit}
        onKeyDown={handleKeyDown}
        className={`h-8 w-full rounded border px-2 text-[16px] md:text-sm outline-none transition-colors hover:border-rf-border focus:border-rf-blue ${
          error ? "border-red-400 bg-rf-danger-bg focus:border-red-500" : "border-transparent"
        }`}
        placeholder="+15551234567"
        title={!isEditing && value ? value : undefined}
      />
      {error && (
        <div className="absolute left-0 top-full z-10 mt-0.5 rounded border border-red-200 bg-rf-danger-bg px-2 py-1 text-xs text-red-700 shadow-sm whitespace-nowrap pointer-events-none">
          {error}
        </div>
      )}
      {isPending && !error && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
        </div>
      )}
    </div>
  );
}

// ===== Status Labels Editor (Monday.com-style inline editing) =====

// Returns the first palette color that isn't already taken by an existing label.
// This is the core fix for the uniqueness-conflict UX problem: new labels always
// start with a safe color, so users never hit a color-conflict error unless they
// intentionally choose an in-use color (which the picker prevents anyway).
function getNextAvailableColor(usedColors: string[]): string {
  const used = new Set(usedColors);
  for (const { value } of STATUS_COLOR_PALETTE) {
    if (!used.has(value)) return value;
  }
  // All 25 palette slots are taken — fall back to last color.
  // Server will reject; user must delete a label to free a slot.
  return STATUS_COLOR_PALETTE[STATUS_COLOR_PALETTE.length - 1].value;
}

function StatusLabelsEditor({
  companyId,
  jobId,
  columnId,
  labels,
  onClose,
}: {
  companyId: string;
  jobId: string;
  columnId: string;
  labels: StatusLabel[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [localLabels, setLocalLabels] = useState<StatusLabel[]>(labels);
  const [editValues, setEditValues] = useState<Record<string, { label: string; color: string }>>({});
  const [newLabel, setNewLabel] = useState("");
  // Smart default: first available unused palette color instead of always "#4F46E5".
  // Computed lazily from the initial labels so the first add never conflicts.
  const [newColor, setNewColor] = useState(() =>
    getNextAvailableColor(labels.map((l) => l.color))
  );
  const [error, setError] = useState<string | null>(null);
  // Inline hint shown near the palette for recoverable color issues (not a red banner).
  // Used as last-resort when a race-condition somehow slips past the smart defaults.
  const [colorHint, setColorHint] = useState<string | null>(null);

  // Refs for label name inputs (used for keyboard focus management).
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const newLabelInputRef = useRef<HTMLInputElement>(null);

  // Initialize local state ONLY when modal opens or columnId changes
  // NOT when labels prop changes (that's what causes the revert bug)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      setLocalLabels(labels);
      const values: Record<string, { label: string; color: string }> = {};
      labels.forEach((label) => {
        values[label.id] = { label: label.label, color: label.color };
      });
      setEditValues(values);
      initializedRef.current = true;
    }
  }, [columnId]); // Only re-initialize if columnId changes

  // Auto-focus the new label input when the modal opens so the user can start
  // typing immediately without an extra click.
  useEffect(() => { newLabelInputRef.current?.focus(); }, []);

  // When localLabels changes (add / delete), ensure newColor is still available.
  // Handles the race-condition edge case where another session takes the pre-selected color.
  useEffect(() => {
    const usedColors = localLabels.map((l) => editValues[l.id]?.color || l.color);
    if (usedColors.includes(newColor)) {
      setNewColor(getNextAvailableColor(usedColors));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localLabels]);

  function onUpdateLabel(labelId: string, overrideColor?: string) {
    const values = editValues[labelId];
    if (!values?.label.trim()) return;

    // Use override color if provided (for immediate color picker updates)
    const finalColor = overrideColor || values.color;

    // Immediately update local state for instant feedback
    setLocalLabels((prev) =>
      prev.map((label) =>
        label.id === labelId
          ? { ...label, label: values.label.trim(), color: finalColor }
          : label
      )
    );

    // Persist to server. editingLabelId is managed by the caller (onBlur / color onChange),
    // not here — so we don't race-condition against the next focused label.
    startTransition(async () => {
      try {
        await updateStatusLabel(companyId, jobId, labelId, {
          label: values.label.trim(),
          color: finalColor,
        });
        setError(null);
      } catch (err) {
        // Revert local state on error
        setLocalLabels((prev) =>
          prev.map((label) =>
            label.id === labelId
              ? labels.find((l) => l.id === labelId) || label
              : label
          )
        );
        setError(err instanceof Error ? err.message : "Failed to update label");
      }
    });
  }

  function onDeleteLabel(labelId: string) {
    const labelToDelete = localLabels.find((l) => l.id === labelId);
    if (!labelToDelete) return;

    // Check if it's the fallback label
    const isFallback = labelToDelete.label.toLowerCase() === "none" || localLabels[0]?.id === labelId;

    if (isFallback) {
      setError("Cannot delete the default label. It is used as a fallback when other labels are deleted.");
      return;
    }

    const ok = confirm(`Delete "${labelToDelete.label}"?`);
    if (!ok) return;

    // Immediately remove from local state
    setLocalLabels((prev) => prev.filter((label) => label.id !== labelId));

    startTransition(async () => {
      try {
        await deleteStatusLabel(companyId, jobId, labelId);
        setError(null);
      } catch (err) {
        // Restore on error
        setLocalLabels((prev) => [...prev, labelToDelete].sort((a, b) => a.sort_order - b.sort_order));
        setError(err instanceof Error ? err.message : "Failed to delete label");
      }
    });
  }

  function onAddLabel() {
    if (!newLabel.trim()) return;

    startTransition(async () => {
      try {
        const created = await createStatusLabel(companyId, jobId, columnId, newLabel.trim(), newColor);
        if (created) {
          const updatedLabels = [...localLabels, created];
          setLocalLabels(updatedLabels);
          // Register the new label in editValues so the useEffect and color picker
          // can reference it correctly without waiting for a re-render cycle.
          setEditValues((prev) => ({
            ...prev,
            [created.id]: { label: created.label, color: created.color },
          }));
          // Pre-select the next available color so the user can add another label
          // immediately without hitting a conflict.
          setNewColor(getNextAvailableColor(updatedLabels.map((l) => l.color)));
        }
        setNewLabel("");
        setColorHint(null);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create label";
        // Last-resort: a color conflict slipped past the smart defaults (race condition).
        // Auto-select the next available color and show a subtle inline hint — not a
        // red banner, since this is recoverable and the user didn't do anything wrong.
        if (msg.toLowerCase().includes("color") || msg.includes("23505")) {
          const usedColors = localLabels.map((l) => editValues[l.id]?.color || l.color);
          setNewColor(getNextAvailableColor(usedColors));
          setColorHint("Color conflict — a new color was auto-selected. Try again.");
        } else {
          setError(msg);
        }
      }
    });
  }

  // Determine fallback label (first label or one named "None")
  const fallbackLabel = localLabels.find((l) => l.label.toLowerCase() === "none") || localLabels[0];

  // Derived color-availability values used to gate the "Add" row and button.
  // These are recomputed on every render so they always reflect pending local edits.
  const usedColorsForNew = localLabels.map((l) => editValues[l.id]?.color || l.color);
  // True when every palette slot is occupied — user must free one before adding.
  const allColorsUsed = STATUS_COLOR_PALETTE.every(({ value }) => usedColorsForNew.includes(value));
  // Safety net: newColor should always be valid after smart-default logic, but
  // this guards against any edge case where it could momentarily be stale.
  const isNewColorValid = !usedColorsForNew.includes(newColor);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-[10px] border border-rf-border bg-rf-surface-card p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-rf-text-primary">Edit Labels</h3>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-rf-danger-bg border border-red-200 rounded-lg text-sm text-rf-danger">
            {error}
          </div>
        )}

        {/* Labels grid — fills 6 rows then wraps to a new column, expanding horizontally
            rather than vertically. No JS chunking needed: CSS handles it automatically. */}
        <div
          className="mt-4"
          style={{
            display: 'grid',
            gridTemplateRows: 'repeat(6, auto)',
            gridAutoFlow: 'column',
            gridAutoColumns: 'minmax(180px, 1fr)',
            gap: '2px 12px',
          }}
        >
          {localLabels.map((label) => {
            const isFallback = fallbackLabel?.id === label.id;
            return (
            <div key={label.id} className="group flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-rf-surface-page transition-colors min-w-0">
                <ColorPicker
                  size="sm"
                  value={editValues[label.id]?.color || label.color}
                  onChange={(color) => {
                    setEditValues((prev) => ({
                      ...prev,
                      [label.id]: { ...prev[label.id], color },
                    }));
                    setEditingLabelId(null);
                    onUpdateLabel(label.id, color);
                  }}
                  disabledColors={localLabels
                    .filter((l) => l.id !== label.id)
                    .map((l) => editValues[l.id]?.color || l.color)}
                />
                <input
                  ref={(el) => { inputRefs.current[label.id] = el; }}
                  type="text"
                  value={editValues[label.id]?.label || label.label}
                  onChange={(e) => {
                    setEditValues((prev) => ({
                      ...prev,
                      [label.id]: { ...prev[label.id], label: e.target.value },
                    }));
                  }}
                  onFocus={() => setEditingLabelId(label.id)}
                  onBlur={() => {
                    onUpdateLabel(label.id);
                    setEditingLabelId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onUpdateLabel(label.id);
                      setEditingLabelId(null);
                      e.currentTarget.blur();
                    }
                    if (e.key === 'Escape') {
                      setEditValues((prev) => ({
                        ...prev,
                        [label.id]: { label: label.label, color: label.color },
                      }));
                      setEditingLabelId(null);
                      e.currentTarget.blur();
                    }
                  }}
                  className="min-w-0 flex-1 px-1.5 py-0.5 text-sm text-rf-text-primary bg-transparent border border-transparent rounded hover:border-rf-border focus:border-rf-blue focus:bg-rf-surface-card outline-none transition-colors"
                  placeholder="Label name"
                />
                {isFallback && (
                  <span className="shrink-0 px-1.5 py-0.5 text-xs font-medium bg-rf-blue-tint text-rf-blue rounded">
                    Default
                  </span>
                )}
                {!isFallback && (
                  <button
                    type="button"
                    onClick={() => onDeleteLabel(label.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-1 text-rf-text-muted hover:text-rf-danger transition-all"
                    title="Delete label"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
            </div>
          );
          })}
        </div>

        {/* "Add new label" row — hidden and replaced with a message when all 25 palette
            colors are already in use. This makes the constraint obvious without an error. */}
        {allColorsUsed ? (
          <div className="mt-4 rounded-[10px] border border-amber-200 bg-rf-warning-bg px-4 py-3 text-sm text-rf-warning">
            All colors are in use. Delete a label or change an existing label&apos;s color to add more.
          </div>
        ) : (
          <>
            {/* Color swatch shows the auto-selected next-available color.
                Clicking the swatch focuses the input, which opens the color picker below.
                onMouseDown:preventDefault keeps focus when clicking the swatch. */}
            <div className="mt-4 flex items-center gap-3 p-3 rounded-[10px] border-2 border-dashed border-rf-ink-100 bg-rf-surface-page">
              {/* Popover ColorPicker — floats over content, no layout shift.
                  Color is pre-selected via getNextAvailableColor(); clicking the swatch
                  is optional. disabledColors prevents choosing a color already in use. */}
              <ColorPicker
                value={newColor}
                onChange={(color) => { setNewColor(color); setColorHint(null); }}
                disabledColors={usedColorsForNew}
              />
              <input
                ref={newLabelInputRef}
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabel.trim() && isNewColorValid) {
                    onAddLabel();
                  }
                }}
                placeholder="New label"
                className="flex-1 px-3 py-2 text-sm bg-rf-surface-card border border-rf-border rounded-lg outline-none focus:border-rf-blue transition-colors"
              />
              {/* Disabled when: pending, no name, or chosen color is somehow already taken. */}
              <button
                type="button"
                onClick={onAddLabel}
                disabled={isPending || !newLabel.trim() || !isNewColorValid}
                className="px-4 py-2 bg-rf-blue text-white text-sm font-medium rounded-[10px] hover:bg-rf-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Add
              </button>
            </div>
            {/* Race-condition hint — shown below the add row, not inside the picker */}
            {colorHint && (
              <p className="mt-1 ml-12 text-xs text-rf-warning">{colorHint}</p>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-rf-blue text-white text-sm font-medium rounded-[10px] hover:bg-rf-blue-dark transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
