"use client";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
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
} from "./actions";
import { DeleteConfirmationModal } from "@/components/modals/delete-confirmation-modal";
import { statusColorArray } from "@/lib/brand-colors";
import { StatusDropdown } from "@/components/ui/status-dropdown";
import { ColorPicker } from "@/components/ui/color-picker";
import { formatPhone } from "@/lib/validation/columnValidation";
import type { BoardColumn as BaseBoardColumn, BoardCell, BoardStatusLabel } from "@/lib/types";
import type { ActiveFilter } from "./view-actions";

type Group = {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  is_collapsed: boolean;
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
}) {
  // CRITICAL: Log props received to debug filtering
  console.log('[ApplicantsBoard] Component rendered with props:', {
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
  const [newGroupName, setNewGroupName] = useState("");

  // Add column modal
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<"text" | "number" | "date" | "file" | "status" | "email" | "phone" | "location">("text");
  const [addColumnError, setAddColumnError] = useState<string | null>(null);
  const [addAfterColumnId, setAddAfterColumnId] = useState<string | null>(null);

  // Status labels editor
  const [editLabelsColumnId, setEditLabelsColumnId] = useState<string | null>(null);

  // Row menu
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);

  // Group color picker
  const [colorPickerGroupId, setColorPickerGroupId] = useState<string | null>(null);

  // Hidden columns dropdown
  const [showHiddenColumnsMenu, setShowHiddenColumnsMenu] = useState(false);

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

  // Filter out hidden columns for display
  const visibleColumns = useMemo(() => {
    return localColumns.filter((col) => !col.is_hidden);
  }, [localColumns]);

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
          if (["text", "email", "phone", "location"].includes(col.type)) {
            const cell = cellLookup.get(`${a.id}::${col.id}`);
            if (cell?.value_text?.toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    // ── Column filters (AND logic) ──────────────────────────────────────────
    for (const f of activeFilters) {
      const col = localColumns.find((c) => c.id === f.columnId);
      if (!col) continue;

      result = result.filter((a) => {
        const cell = cellLookup.get(`${a.id}::${f.columnId}`);

        // Empty / not empty checks work on any type
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

        // Type-specific conditions
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

        // Text-like (text, email, phone, location)
        const tv = (cell?.value_text ?? "").toLowerCase();
        const fvl = f.value.toLowerCase();
        if (f.condition === "contains") return tv.includes(fvl);
        if (f.condition === "equals") return tv === fvl;
        return true;
      });
    }

    return result;
  }, [localApplicants, searchQuery, activeFilters, localColumns, cellLookup, statusLabelById]);

  const applicantsByGroup = useMemo(() => {
    console.log('[ApplicantsBoard] Starting grouping with:', {
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
    console.log('[ApplicantsBoard] Grouping complete:', {
      inputApplicants: filteredApplicants.length,
      outputApplicants: totalGrouped,
    });

    return map;
  }, [groups, filteredApplicants]);

  const cellsByApplicantAndColumn = useMemo(() => {
    const map = new Map<string, BoardCell>();
    for (const c of cells) {
      map.set(`${c.applicant_id}::${c.column_id}`, c);
    }
    return map;
  }, [cells]);

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

  function onCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;

    startTransition(async () => {
      await createGroup(companyId, jobId, boardId, name);
      setNewGroupName("");
    });
  }

  function onToggleGroupCollapse(groupId: string, currentCollapsed: boolean) {
    startTransition(async () => {
      await toggleGroupCollapse(companyId, jobId, boardId, groupId, !currentCollapsed);
    });
  }

  function onUpdateGroupColor(groupId: string, color: string) {
    startTransition(async () => {
      await updateGroupColor(companyId, jobId, boardId, groupId, color);
      setColorPickerGroupId(null);
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
      await deleteGroup(companyId, jobId, boardId, groupToDelete.id);
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

  function onToggleMinimizeColumn(columnId: string) {
    const column = localColumns.find((col) => col.id === columnId);
    if (!column) return;

    const isCurrentlyCollapsed = column.settings?.ui?.collapsed || false;
    const newSettings = {
      ...column.settings,
      ui: {
        ...column.settings?.ui,
        collapsed: !isCurrentlyCollapsed,
      },
    };

    startTransition(async () => {
      await updateBoardColumn(companyId, jobId, columnId, { settings: newSettings });
    });
  }

  function onShowColumn(columnId: string) {
    startTransition(async () => {
      await updateBoardColumn(companyId, jobId, columnId, { is_hidden: false });
    });
  }

  function onAddColumnRight(afterColumnId: string) {
    setAddAfterColumnId(afterColumnId);
    setShowAddColumnModal(true);
  }

  function onMoveApplicant(applicantId: string, groupId: string) {
    startTransition(async () => {
      await moveApplicant(companyId, jobId, applicantId, groupId);
      setRowMenuOpen(null);
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

    const cell = cellsByApplicantAndColumn.get(`${applicant.id}::${column.id}`);
    if (!cell) return null;

    if (column.type === "text") return cell.value_text;
    if (column.type === "number") return cell.value_number;
    if (column.type === "date") return cell.value_date;
    if (column.type === "status") return cell.value_status_label_id;
    if (column.type === "email") return cell.value_text;
    if (column.type === "phone") return cell.value_text;
    if (column.type === "location") return cell.value_text;
    if (column.type === "file") return cell.value_text; // File path stored as text
    return null;
  }

  function onQuickCreateApplicant(groupId: string) {
    startTransition(async () => {
      try {
        await quickCreateApplicant(companyId, jobId, groupId, boardId);
      } catch (error) {
        console.error("[onQuickCreateApplicant] Error:", error);
        alert("Failed to create applicant. Please try again.");
      }
    });
  }

  function onUpdateCell(applicantId: string, columnId: string, columnType: "text" | "number" | "date" | "status", value: any) {
    startTransition(async () => {
      // BULK STATUS UPDATE: If this is a status column AND multiple rows are selected AND this row is selected,
      // update all selected rows with the new status value
      if (columnType === "status" && selectedIds.length > 1 && selected[applicantId]) {
        console.log('[onUpdateCell] Bulk status update triggered:', {
          applicantId,
          columnId,
          statusLabelId: value,
          selectedCount: selectedIds.length,
          selectedIds,
        });

        try {
          const result = await bulkUpdateStatusCells(
            companyId,
            jobId,
            selectedIds,
            columnId,
            value
          );

          console.log('[onUpdateCell] Bulk update result:', result);

          if (result.failed > 0) {
            // Show partial failure warning
            alert(`Updated ${result.successful} of ${selectedIds.length} applicants. ${result.failed} failed.`);
          }

          // Keep selection after bulk status update for multiple operations
        } catch (error) {
          console.error('[onUpdateCell] Bulk update failed:', error);
          alert('Failed to update selected applicants. Please try again.');
        }
      } else {
        // Single cell update
        await updateBoardCell(companyId, jobId, applicantId, columnId, columnType, value);
      }
    });
  }

  if (!mounted) {
    return <div className="min-h-[60vh] bg-stone-50" />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-[calc(100dvh-7rem)] md:h-[calc(100vh-8rem)] flex-col overflow-hidden bg-stone-50">
        {/* Hidden Columns Control */}
        {hiddenColumns.length > 0 && (
          <div className="px-6 py-3 border-b border-stone-200 bg-white">
            <div className="relative inline-block">
              <button
                onClick={() => setShowHiddenColumnsMenu(!showHiddenColumnsMenu)}
                className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                <span>Hidden Columns ({hiddenColumns.length})</span>
                <span className="text-xs">▼</span>
              </button>
              {showHiddenColumnsMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowHiddenColumnsMenu(false)}
                  />
                  <div className="absolute left-0 top-full mt-2 w-64 rounded-lg border border-stone-200 bg-white shadow-lg z-20">
                    <div className="py-1 max-h-64 overflow-y-auto">
                      {hiddenColumns.map((col) => (
                        <button
                          key={col.id}
                          onClick={() => {
                            onShowColumn(col.id);
                            setShowHiddenColumnsMenu(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                        >
                          {col.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ====== MOBILE CARD VIEW (hidden on md+) ====== */}
        <div className="md:hidden flex-1 overflow-auto">
          <div className="p-3 space-y-4">
            {localGroups.map((g) => {
              const rows = applicantsByGroup.get(g.id) ?? [];
              return (
                <section key={g.id}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <button
                      onClick={() => onToggleGroupCollapse(g.id, g.is_collapsed)}
                      className="text-stone-500 text-xs"
                    >
                      {g.is_collapsed ? "▶" : "▼"}
                    </button>
                    <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                    <span className="font-semibold text-stone-900 text-sm">{g.name}</span>
                    <span className="text-xs text-stone-400">({rows.length})</span>
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
                            className={`bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden ${selected[a.id] ? "ring-2 ring-blue-500" : ""}`}
                          >
                            {/* Card top: Name + menu */}
                            <div className="flex items-start justify-between px-4 pt-3 pb-1">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={!!selected[a.id]}
                                  onChange={() => toggleRow(a.id)}
                                  className="h-4 w-4 rounded border-stone-300 flex-shrink-0"
                                />
                                <span className="font-semibold text-stone-900 text-sm truncate">
                                  {nameCol ? getCellValue(a, nameCol) || a.full_name : a.full_name}
                                </span>
                              </div>
                              {/* Row actions menu */}
                              <div className="relative flex-shrink-0 ml-2">
                                <button
                                  onClick={() => setRowMenuOpen(menuOpen ? null : a.id)}
                                  className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
                                >
                                  ⋮
                                </button>
                                {menuOpen && (
                                  <>
                                    <div className="fixed inset-0 z-[30]" onClick={() => setRowMenuOpen(null)} />
                                    <div className="absolute right-0 top-full mt-1 z-[31] w-40 rounded-lg border border-stone-200 bg-white py-1 shadow-xl">
                                      <div className="px-3 py-1 text-xs font-medium text-stone-400">Move to</div>
                                      {localGroups.map((grp) => (
                                        <button
                                          key={grp.id}
                                          onClick={() => onMoveApplicant(a.id, grp.id)}
                                          className="w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                                        >
                                          {grp.name}
                                        </button>
                                      ))}
                                      <div className="my-1 border-t border-stone-100" />
                                      <button onClick={() => onDuplicateApplicant(a.id)} className="w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50">Duplicate</button>
                                      <button onClick={() => onDeleteApplicant(a.id)} className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Delete</button>
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
                                  <span className="text-xs text-stone-500 w-16 flex-shrink-0">Status</span>
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
                                  <span className="text-xs text-stone-500 w-16 flex-shrink-0">Email</span>
                                  <span className="text-sm text-stone-700 truncate">
                                    {getCellValue(a, emailCols[0]) || a.email || "—"}
                                  </span>
                                </div>
                              )}
                              {/* Phone */}
                              {phoneCols[0] && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-stone-500 w-16 flex-shrink-0">Phone</span>
                                  <span className="text-sm text-stone-700 truncate">
                                    {getCellValue(a, phoneCols[0]) || a.phone || "—"}
                                  </span>
                                </div>
                              )}
                              {/* Applied date */}
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-stone-500 w-16 flex-shrink-0">Applied</span>
                                <span className="text-xs text-stone-400">
                                  {new Date(a.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>

                            {/* Expand toggle */}
                            {expandedCols.length > 0 && (
                              <button
                                onClick={() => setMobileExpandedRows(prev => ({ ...prev, [a.id]: !isExpanded }))}
                                className="w-full px-4 py-2 text-xs text-stone-500 hover:text-stone-700 hover:bg-stone-50 border-t border-stone-100 text-left flex items-center gap-1 transition-colors"
                              >
                                {isExpanded ? "▲ Show less" : `▼ Show ${expandedCols.length} more field${expandedCols.length !== 1 ? "s" : ""}`}
                              </button>
                            )}

                            {/* Expanded: all other columns */}
                            {isExpanded && (
                              <div className="px-4 pb-3 pt-1 border-t border-stone-100 space-y-2 bg-stone-50/50">
                                {expandedCols.map((col) => (
                                  <div key={col.id} className="flex items-start gap-2">
                                    <span className="text-xs text-stone-500 w-24 flex-shrink-0 pt-1.5">{col.name}</span>
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
                        className="w-full py-2.5 text-sm text-stone-400 hover:text-blue-600 hover:bg-blue-50/30 rounded-xl border border-dashed border-stone-200 transition-colors"
                      >
                        + Add item
                      </button>
                    </div>
                  )}
                </section>
              );
            })}

            {/* Add new group on mobile */}
            <div className="flex items-center gap-2 pt-2">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="New group name"
                className="flex-1 h-11 rounded-lg border border-stone-200 bg-white px-3 text-base outline-none focus:border-stone-400"
              />
              <button
                onClick={onCreateGroup}
                disabled={isPending || !newGroupName.trim()}
                className="h-11 px-4 rounded-lg bg-stone-900 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60 whitespace-nowrap"
              >
                + Group
              </button>
            </div>
          </div>
        </div>

        {/* ====== DESKTOP TABLE VIEW (hidden on mobile) ====== */}
        <div className="hidden md:block flex-1 overflow-auto">
          <div className="min-w-max p-6">
            {/* Groups */}
            <div className="space-y-4">
              {/* Wrap groups in SortableContext */}
              <SortableContext
                items={localGroups.map((g) => `group-${g.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {/* Render regular groups */}
                {localGroups.map((g) => {
                  const rows = applicantsByGroup.get(g.id) ?? [];
                  return (
                    <section key={g.id} className="space-y-2">
                      {/* Sortable Group header */}
                      <SortableGroupHeader
                        group={g}
                        rowCount={rows.length}
                        isCollapsed={g.is_collapsed}
                        onToggleCollapse={() => onToggleGroupCollapse(g.id, g.is_collapsed)}
                        colorPickerOpen={colorPickerGroupId === g.id}
                        onColorPickerToggle={() => setColorPickerGroupId(colorPickerGroupId === g.id ? null : g.id)}
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
                      />

                    {/* Group table */}
                    {!g.is_collapsed && (
                      <div className="overflow-visible rounded-lg border border-stone-200 bg-white">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-stone-50/80">
                            <tr className="border-b border-stone-200">
                              <th className="sticky left-0 z-10 w-10 bg-stone-50/80 px-4 py-2"></th>

                              {/* Sortable columns */}
                              <SortableContext
                                items={visibleColumns.map((c) => `col-${c.id}`)}
                                strategy={horizontalListSortingStrategy}
                              >
                                {visibleColumns.map((col) => (
                                  <SortableColumnHeader
                                    key={col.id}
                                    column={col}
                                    onSaveEdit={(newName) => onSaveColumnName(col.id, newName)}
                                    onDelete={() => onDeleteColumn(col.id)}
                                    onToggleMinimize={() => onToggleMinimizeColumn(col.id)}
                                    onAddRight={() => onAddColumnRight(col.id)}
                                  />
                                ))}
                              </SortableContext>

                              {/* Add column button */}
                              <th className="px-4 py-2">
                                <button
                                  onClick={() => setShowAddColumnModal(true)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition"
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
                                <td colSpan={visibleColumns.length + 2} className="px-4 py-8 text-sm text-stone-400 text-center">
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
                                    onMove={(groupId) => onMoveApplicant(a.id, groupId)}
                                    onDuplicate={() => onDuplicateApplicant(a.id)}
                                    onDelete={() => onDeleteApplicant(a.id)}
                                  />
                                ))}
                              </SortableContext>
                            )}

                            {/* "+ Add item" row - Monday.com style inline creation */}
                            <tr
                              onClick={() => onQuickCreateApplicant(g.id)}
                              className="border-t border-stone-200 hover:bg-blue-50/30 cursor-pointer transition-colors group/addrow"
                            >
                              <td className="sticky left-0 z-10 bg-white group-hover/addrow:bg-blue-50/30 px-4 py-3 border-r border-stone-100">
                                <div className="flex items-center gap-2 text-stone-400 group-hover/addrow:text-blue-600 transition-colors">
                                  <span className="text-sm font-semibold">+</span>
                                </div>
                              </td>
                              <td colSpan={visibleColumns.length + 1} className="px-4 py-3">
                                <span className="text-sm text-stone-400 group-hover/addrow:text-blue-600 font-medium transition-colors">
                                  Add item
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                    </section>
                  );
                })}
              </SortableContext>

              {/* Render orphaned applicants group if it exists */}
              {applicantsByGroup.has('__orphaned__') && (() => {
                const orphanedRows = applicantsByGroup.get('__orphaned__') ?? [];
                return (
                  <section key="__orphaned__" className="space-y-2">
                    {/* Orphaned group header with warning styling */}
                    <div className="flex items-center gap-3 px-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="h-4 w-4 rounded" style={{ backgroundColor: '#ef4444' }} />
                      <h2 className="text-base font-semibold text-red-900">⚠️ Orphaned Applicants</h2>
                      <span className="text-sm text-red-600">({orphanedRows.length})</span>
                      <span className="text-xs text-red-600 ml-auto">
                        Board mismatch - check console for details
                      </span>
                    </div>

                    {/* Orphaned group table */}
                    <div className="overflow-visible rounded-lg border-2 border-red-300 bg-red-50/30">
                      <div className="bg-red-100 p-3 text-sm text-red-800 border-b border-red-200">
                        <strong>⚠️ Warning:</strong> These applicants have group_ids that don't match any group in the current board.
                        This usually means multiple boards exist for this job. Check the browser console for diagnostic information.
                      </div>
                      <table className="w-full text-left border-collapse bg-white">
                        <thead className="bg-stone-50/80">
                          <tr className="border-b border-stone-200">
                            <th className="sticky left-0 z-10 w-10 bg-stone-50/80 px-4 py-2"></th>
                            {visibleColumns.map((col) => (
                              <th key={col.id} className="px-4 py-2 text-xs font-medium text-stone-700 border-r border-stone-200">
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
                              onMove={(groupId) => onMoveApplicant(a.id, groupId)}
                              onDuplicate={() => onDuplicateApplicant(a.id)}
                              onDelete={() => onDeleteApplicant(a.id)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })()}

              {/* Add new group */}
              <div className="flex items-center gap-3 pt-4 px-2">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="New group name"
                  className="h-9 w-64 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-400"
                />
                <button
                  onClick={onCreateGroup}
                  disabled={isPending || !newGroupName.trim()}
                  className="flex h-9 items-center gap-2 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
                >
                  <span>+ Add new group</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Add Column Modal */}
        {showAddColumnModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm p-0 sm:p-4">
            <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-stone-200 bg-white p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-stone-900">Add Column</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700">Column name</label>
                  <input
                    value={newColumnName}
                    onChange={(e) => {
                      setNewColumnName(e.target.value);
                      setAddColumnError(null);
                    }}
                    placeholder="e.g. Interview Score"
                    className="mt-1 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-base outline-none focus:border-stone-400"
                    autoFocus
                  />
                  {addColumnError && (
                    <p className="mt-1.5 text-xs text-red-600">{addColumnError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700">Column type</label>
                  <select
                    value={newColumnType}
                    onChange={(e) => setNewColumnType(e.target.value as any)}
                    className="mt-1 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-base outline-none focus:border-stone-400"
                  >
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="location">Location</option>
                    <option value="file">File</option>
                    <option value="status">Status</option>
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
                  className="h-11 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 hover:bg-stone-50 w-full sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  onClick={onAddColumn}
                  disabled={isPending || !newColumnName.trim()}
                  className="h-11 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60 w-full sm:w-auto"
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
          <div className="fixed bottom-0 sm:bottom-6 left-0 sm:left-1/2 right-0 sm:right-auto z-50 w-full sm:w-[min(920px,calc(100%-24px))] sm:-translate-x-1/2 rounded-none sm:rounded-xl border-t sm:border border-stone-200 bg-white px-4 py-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-stone-700">
                <span className="font-semibold">{selectedIds.length}</span> selected
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  onChange={(e) => {
                    const groupId = e.target.value;
                    if (groupId) onMoveToGroup(groupId);
                    e.currentTarget.value = "";
                  }}
                  className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none"
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
                  className="h-10 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
                >
                  Delete
                </button>

                <button
                  onClick={clearSelection}
                  disabled={isPending}
                  className="h-10 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
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
              await deleteGroup(companyId, jobId, boardId, groupToDelete.id);
              return { success: true };
            }}
          />
        )}
      </div>
    </DndContext>
  );
}

// ===== Sortable Column Header =====

function SortableColumnHeader({
  column,
  onDelete,
  onToggleMinimize,
  onAddRight,
  onSaveEdit,
}: {
  column: BoardColumn;
  onDelete: () => void;
  onToggleMinimize: () => void;
  onAddRight: () => void;
  onSaveEdit: (newName: string) => void;
}) {
  // Local edit state - matches CellRenderer pattern exactly
  const [localValue, setLocalValue] = useState(column.name);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCollapsed = column.settings?.ui?.collapsed || false;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-${column.id}`,
    disabled: isEditing || isCollapsed,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

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

  // Calculate menu position when it opens
  useEffect(() => {
    if (menuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    } else {
      setMenuPosition(null);
    }
  }, [menuOpen]);

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`group py-2 text-xs font-medium text-stone-700 border-r border-stone-200 last:border-r-0 ${
        isCollapsed ? "px-1 w-12" : "px-4"
      }`}
      {...attributes}
    >
      {isCollapsed ? (
        <div className="flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMinimize();
            }}
            className="text-stone-600 hover:text-stone-900 cursor-pointer text-sm"
            title={`Expand ${column.name}`}
          >
            ↔
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onMouseDown={(e) => {
                // Prevent event from bubbling to parent that might interfere
                e.stopPropagation();
              }}
              className="h-7 w-32 rounded border border-stone-300 px-2 text-xs outline-none focus:border-blue-500"
            />
          ) : (
            <>
              {/* Kebab menu button on LEFT */}
              {!column.is_system && (
                <button
                  ref={menuButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(!menuOpen);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-stone-900 transition-opacity text-xs font-bold"
                >
                  ⋮
                </button>
              )}

              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="text-left hover:text-stone-900 cursor-text"
                disabled={column.is_system}
              >
                {column.name}
              </button>
              {!column.is_system && (
                <button
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing text-stone-400 hover:text-stone-600"
                >
                  ⋮⋮
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
            className="fixed z-[999] w-48 rounded-lg border border-stone-200 bg-white py-1 shadow-xl"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
          >
            <button
              onClick={() => {
                onToggleMinimize();
                setMenuOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              Minimize column
            </button>
            <button
              onClick={() => {
                onAddRight();
                setMenuOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              Add column to right
            </button>
            <button
              onClick={() => {
                setIsEditing(true);
                setMenuOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              Rename column
            </button>
            <div className="my-1 border-t border-stone-100" />
            <button
              onClick={() => {
                onDelete();
                setMenuOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Delete column
            </button>
          </div>
        </>,
        document.body
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
  onMove,
  onDuplicate,
  onDelete,
}: {
  applicant: ApplicantRow;
  columns: BoardColumn[];
  selected: boolean;
  onToggle: () => void;
  getCellValue: (col: BoardColumn) => any;
  onUpdateCell: (colId: string, colType: "text" | "number" | "date" | "status", val: any) => void;
  labelsByColumn: Map<string, StatusLabel[]>;
  onEditLabels: (colId: string) => void;
  rowMenuOpen: boolean;
  setRowMenuOpen: (open: boolean) => void;
  groups: Group[];
  onMove: (groupId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
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
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const cellEls: React.ReactNode[] = [];

  // Calculate menu position when it opens
  useEffect(() => {
    if (rowMenuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    } else {
      setMenuPosition(null);
    }
  }, [rowMenuOpen]);

  // Sticky left cell (checkbox + row menu)
  cellEls.push(
    <td
      key="__sticky__"
      className="sticky left-0 z-10 bg-white group-hover:bg-stone-50/60 px-4 py-2 border-r border-stone-100"
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            ref={menuButtonRef}
            onClick={() => setRowMenuOpen(!rowMenuOpen)}
            className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-700 transition text-sm"
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
                className="fixed z-[999] w-40 rounded-lg border border-stone-200 bg-white py-1 shadow-xl"
                style={{
                  top: `${menuPosition.top}px`,
                  left: `${menuPosition.left}px`,
                }}
              >
                <div className="px-3 py-1 text-xs font-medium text-stone-400">Move to</div>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => onMove(g.id)}
                    className="w-full px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50"
                  >
                    {g.name}
                  </button>
                ))}
                <div className="my-1 border-t border-stone-100" />
                <button
                  onClick={onDuplicate}
                  className="w-full px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50"
                >
                  Duplicate
                </button>
                <button
                  onClick={onDelete}
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </>,
            document.body
          )}
        </div>

        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 rounded border-stone-300"
        />

        <button
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-stone-400 hover:text-stone-600 text-xs opacity-0 group-hover:opacity-100"
        >
          ⋮⋮
        </button>
      </div>
    </td>
  );

  // Dynamic board columns
  for (const col of columns) {
    const isCollapsed = col.settings?.ui?.collapsed || false;
    cellEls.push(
      <td
        key={col.id}
        className={`py-2 border-r border-stone-100 last:border-r-0 ${isCollapsed ? "px-1 w-12" : "px-4"}`}
      >
        <CellRenderer
          applicant={applicant}
          column={col}
          value={getCellValue(col)}
          labels={labelsByColumn.get(col.id) ?? []}
          onUpdate={(val) => onUpdateCell(col.id, col.type as any, val)}
          onEditLabels={() => onEditLabels(col.id)}
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
      className="group border-b border-stone-100 hover:bg-stone-50/60 relative"
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
  colorPickerOpen,
  onColorPickerToggle,
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
}: {
  group: Group;
  rowCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  colorPickerOpen: boolean;
  onColorPickerToggle: () => void;
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
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `group-${group.id}`,
    disabled: isEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate menu position when it opens
  useEffect(() => {
    if (menuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    } else {
      setMenuPosition(null);
    }
  }, [menuOpen]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-3 px-2"
      {...attributes}
    >
      {/* Drag handle */}
      <button
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-stone-400 hover:text-stone-600 text-sm transition-opacity"
      >
        ⋮⋮
      </button>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="text-stone-600 hover:text-stone-900 text-sm"
      >
        {isCollapsed ? "▶" : "▼"}
      </button>

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={onColorPickerToggle}
          className="h-4 w-4 rounded cursor-pointer hover:ring-2 hover:ring-stone-300 transition"
          style={{ backgroundColor: group.color }}
        />
        {/* Color picker dropdown */}
        {colorPickerOpen && (
          <div className="absolute left-0 top-6 z-50 rounded-lg border border-stone-200 bg-white p-3 shadow-xl">
            <div className="grid grid-cols-8 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => onColorChange(color)}
                  className="h-6 w-6 rounded border border-stone-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Inline editable name */}
      {isEditing ? (
        <input
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
          className="h-7 w-48 rounded border border-stone-300 px-2 text-sm outline-none focus:border-stone-500"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
      ) : (
        <button
          onClick={onStartEdit}
          className="text-base font-semibold text-stone-900 hover:text-stone-700 cursor-text"
        >
          {group.name}
        </button>
      )}

      <span className="text-sm text-stone-400">({rowCount})</span>

      {/* Kebab menu button */}
      <button
        ref={menuButtonRef}
        onClick={onMenuToggle}
        className="opacity-0 group-hover:opacity-100 ml-2 text-stone-600 hover:text-stone-900 transition-opacity text-sm font-bold"
      >
        ⋮
      </button>

      {/* Render menu in a portal to escape overflow/z-index issues */}
      {menuOpen && menuPosition && typeof window !== 'undefined' && createPortal(
        <>
          {/* Backdrop to close menu when clicking outside */}
          <div
            className="fixed inset-0 z-[998]"
            onClick={onMenuToggle}
          />
          <div
            className="fixed z-[999] w-40 rounded-lg border border-stone-200 bg-white py-1 shadow-xl"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
          >
            <button
              onClick={onRename}
              className="w-full px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              Rename
            </button>
            <div className="my-1 border-t border-stone-100" />
            <button
              onClick={onDelete}
              className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </>,
        document.body
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
}: {
  applicant: ApplicantRow;
  column: BoardColumn;
  value: any;
  labels: StatusLabel[];
  onUpdate: (val: any) => void;
  onEditLabels: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  // If column is collapsed, show minimal content
  const isCollapsed = column.settings?.ui?.collapsed || false;
  if (isCollapsed) {
    return <span className="text-xs text-stone-400">—</span>;
  }

  // Local edit state - only save on blur/enter
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  // Update local value when prop changes (from server)
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value);
    }
  }, [value, isEditing]);

  // Commit the edit to server
  const commitEdit = () => {
    if (localValue !== value) {
      console.log('[CellRenderer] Committing edit:', {
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
      return <span className="text-sm text-stone-700">{value || "—"}</span>;
    }
    if (column.type === "status") {
      const selectedLabel = labels.find((l) => l.label.toLowerCase() === value?.toLowerCase());
      return (
        <div className="flex items-center gap-2">
          {selectedLabel && (
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: selectedLabel.color }} />
          )}
          <span className="text-sm text-stone-700">{value || "—"}</span>
        </div>
      );
    }
    return <span className="text-sm text-stone-700">{value || "—"}</span>;
  }

  if (column.type === "text") {
    return (
      <div className="relative">
        <input
          type="text"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-stone-200 focus:border-blue-500"
          placeholder="—"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-blue-500" />
          </div>
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
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-stone-200 focus:border-blue-500"
          placeholder="—"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-blue-500" />
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
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-stone-200 focus:border-blue-500"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-blue-500" />
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
    return (
      <div className="relative">
        <input
          type="email"
          value={localValue ?? ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-stone-200 focus:border-blue-500"
          placeholder="email@example.com"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  if (column.type === "phone") {
    return (
      <div className="relative">
        <input
          type="tel"
          value={localValue ? formatPhone(localValue) : ""}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-stone-200 focus:border-blue-500"
          placeholder="(123) 456-7890"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-blue-500" />
          </div>
        )}
      </div>
    );
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
          className="h-8 w-full rounded border border-transparent px-2 text-[16px] md:text-sm outline-none hover:border-stone-200 focus:border-blue-500"
          placeholder="City, State"
        />
        {isPending && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-blue-500" />
          </div>
        )}
      </div>
    );
  }

  if (column.type === "file") {
    if (!value) {
      return <span className="text-stone-300">—</span>;
    }
    return (
      <a
        href={`/api/resumes/view?applicantId=${applicant.id}`}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 hover:underline text-sm"
      >
        View
      </a>
    );
  }

  return <span className="text-stone-300">—</span>;
}

// ===== Status Labels Editor (Monday.com-style inline editing) =====

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
  const [newColor, setNewColor] = useState("#4F46E5");
  const [showColorPickerForId, setShowColorPickerForId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    // Persist to server
    startTransition(async () => {
      try {
        await updateStatusLabel(companyId, jobId, labelId, {
          label: values.label.trim(),
          color: finalColor,
        });
        setEditingLabelId(null);
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
        // Add to local state immediately
        if (created) {
          setLocalLabels((prev) => [...prev, created]);
        }
        setNewLabel("");
        setNewColor("#4F46E5");
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create label");
      }
    });
  }

  // Determine fallback label (first label or one named "None")
  const fallbackLabel = localLabels.find((l) => l.label.toLowerCase() === "none") || localLabels[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-[10px] border border-stone-200 bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-stone-900">Edit Status Labels</h3>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Labels list - all inline editable */}
        <div className="mt-6 space-y-2 max-h-96 overflow-y-auto">
          {localLabels.map((label) => {
            const isFallback = fallbackLabel?.id === label.id;
            return (
            <div key={label.id} className="group">
              <div className="flex items-center gap-3 p-2 rounded-[10px] hover:bg-stone-50 transition-colors">
                {/* Color swatch - clickable */}
                <button
                  type="button"
                  onClick={() => setShowColorPickerForId(showColorPickerForId === label.id ? null : label.id)}
                  className="h-9 w-9 rounded-lg border border-stone-200 hover:border-stone-400 transition-colors flex-shrink-0"
                  style={{ backgroundColor: editValues[label.id]?.color || label.color }}
                  title="Change color"
                />

                {/* Inline editable text field */}
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editValues[label.id]?.label || label.label}
                    onChange={(e) => {
                      setEditValues((prev) => ({
                        ...prev,
                        [label.id]: {
                          ...prev[label.id],
                          label: e.target.value,
                        },
                      }));
                    }}
                    onFocus={() => setEditingLabelId(label.id)}
                    onBlur={() => {
                      if (editingLabelId === label.id) {
                        onUpdateLabel(label.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onUpdateLabel(label.id);
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
                    className="flex-1 px-2 py-1 text-sm font-medium text-stone-900 bg-transparent border border-transparent rounded-lg hover:border-stone-200 focus:border-blue-500 focus:bg-white outline-none transition-colors"
                    placeholder="Label name"
                  />
                  {isFallback && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                      Default
                    </span>
                  )}
                </div>

                {/* Delete button - disabled for fallback label */}
                {!isFallback && (
                  <button
                    type="button"
                    onClick={() => onDeleteLabel(label.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-stone-400 hover:text-red-600 transition-all"
                    title="Delete label"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Inline color picker */}
              {showColorPickerForId === label.id && (
                <div className="ml-12 mt-2 p-3 bg-stone-50 rounded-[10px]">
                  <ColorPicker
                    value={editValues[label.id]?.color || label.color}
                    onChange={(color) => {
                      setEditValues((prev) => ({
                        ...prev,
                        [label.id]: {
                          ...prev[label.id],
                          color,
                        },
                      }));
                      // Pass color as override to avoid race condition with async state update
                      onUpdateLabel(label.id, color);
                      setShowColorPickerForId(null);
                    }}
                    inline
                    disabledColors={localLabels
                      .filter((l) => l.id !== label.id)
                      .map((l) => editValues[l.id]?.color || l.color)}
                  />
                </div>
              )}
            </div>
          );
          })}
        </div>

        {/* Add new label */}
        <div className="mt-4 flex items-center gap-3 p-3 rounded-[10px] border-2 border-dashed border-stone-300 bg-stone-50">
          <button
            type="button"
            onClick={() => setShowColorPickerForId('new')}
            className="h-9 w-9 rounded-lg border border-stone-200 hover:border-stone-400 transition-colors flex-shrink-0"
            style={{ backgroundColor: newColor }}
            title="Choose color"
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newLabel.trim()) {
                onAddLabel();
              }
            }}
            placeholder="Add new label"
            className="flex-1 px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg outline-none focus:border-blue-500 transition-colors"
          />
          <button
            type="button"
            onClick={onAddLabel}
            disabled={isPending || !newLabel.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-[10px] hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            Add
          </button>
        </div>

        {/* Inline color picker for new label */}
        {showColorPickerForId === 'new' && (
          <div className="ml-12 mt-2 p-3 bg-stone-50 rounded-[10px]">
            <ColorPicker
              value={newColor}
              onChange={(color) => {
                setNewColor(color);
                setShowColorPickerForId(null);
              }}
              inline
              disabledColors={localLabels.map((l) => editValues[l.id]?.color || l.color)}
            />
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-[10px] hover:bg-blue-700 transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
