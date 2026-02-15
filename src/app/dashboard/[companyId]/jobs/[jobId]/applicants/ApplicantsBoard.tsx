"use client";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
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
} from "./actions";
import { DeleteConfirmationModal } from "@/components/modals/delete-confirmation-modal";

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

type BoardColumn = {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "file" | "status";
  is_system: boolean;
  sort_order: number;
  is_hidden?: boolean;
};

type StatusLabel = {
  id: string;
  column_id: string;
  label: string;
  color: string;
  sort_order: number;
};

type BoardCell = {
  applicant_id: string;
  column_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_status_label_id: string | null;
};

const PRESET_COLORS = [
  "#0073ea", "#00c875", "#fdab3d", "#e2445c", "#9cd326", "#784bd1", "#579bfc", "#ff642e",
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899",
];

export default function ApplicantsBoard({
  companyId,
  jobId,
  boardId,
  groups,
  applicants,
  columns,
  statusLabels,
  cells,
}: {
  companyId: string;
  jobId: string;
  boardId: string;
  groups: Group[];
  applicants: ApplicantRow[];
  columns: BoardColumn[];
  statusLabels: StatusLabel[];
  cells: BoardCell[];
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

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [newGroupName, setNewGroupName] = useState("");

  // Column editing state
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnValue, setEditingColumnValue] = useState("");

  // Add column modal
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<"text" | "number" | "date" | "file" | "status">("text");

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

  const applicantsByGroup = useMemo(() => {
    console.log('[ApplicantsBoard] Starting grouping with:', {
      totalApplicants: localApplicants.length,
      totalGroups: groups.length,
      applicants: localApplicants.map(a => ({
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

    for (const a of localApplicants) {
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
      inputApplicants: localApplicants.length,
      outputApplicants: totalGrouped,
      distribution: Array.from(map.entries()).map(([groupId, apps]) => ({
        groupId,
        groupName: groupId === '__orphaned__' ? '⚠️ Orphaned' : groups.find(g => g.id === groupId)?.name,
        count: apps.length,
      })),
    });

    // SANITY CHECK: Ensure we didn't lose any applicants
    if (totalGrouped !== localApplicants.length) {
      console.error('[ApplicantsBoard] CRITICAL BUG: Lost applicants during grouping!', {
        input: localApplicants.length,
        output: totalGrouped,
        lost: localApplicants.length - totalGrouped,
      });
    }

    return map;
  }, [groups, localApplicants]);

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
      clearSelection();
    });
  }

  function onMoveToGroup(groupId: string) {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      await bulkMoveApplicants(companyId, jobId, selectedIds, groupId);
      clearSelection();
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

    startTransition(async () => {
      await createBoardColumn(companyId, jobId, name, newColumnType);
      setShowAddColumnModal(false);
      setNewColumnName("");
      setNewColumnType("text");
    });
  }

  function onSaveColumnName(columnId: string) {
    const name = editingColumnValue.trim();
    if (!name) return;

    startTransition(async () => {
      await updateBoardColumn(companyId, jobId, columnId, { name });
      setEditingColumnId(null);
      setEditingColumnValue("");
    });
  }

  function onDeleteColumn(columnId: string) {
    const ok = confirm("Delete this column? All data in this column will be lost.");
    if (!ok) return;

    startTransition(async () => {
      await deleteBoardColumn(companyId, jobId, columnId);
    });
  }

  function onHideColumn(columnId: string) {
    startTransition(async () => {
      await updateBoardColumn(companyId, jobId, columnId, { is_hidden: true });
    });
  }

  function onShowColumn(columnId: string) {
    startTransition(async () => {
      await updateBoardColumn(companyId, jobId, columnId, { is_hidden: false });
    });
  }

  function onAddColumnRight(afterColumnId: string) {
    setShowAddColumnModal(true);
    // We'll need to track which column to add after
    // For now, just open the modal - we can enhance this later
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
    return null;
  }

  function onUpdateCell(applicantId: string, columnId: string, columnType: "text" | "number" | "date" | "status", value: any) {
    startTransition(async () => {
      await updateBoardCell(companyId, jobId, applicantId, columnId, columnType, value);
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
      <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden bg-stone-50">
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

        {/* Board content - single horizontal scroll */}
        <div className="flex-1 overflow-auto">
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
                                    isEditing={editingColumnId === col.id}
                                    editValue={editingColumnValue}
                                    onStartEdit={() => {
                                      setEditingColumnId(col.id);
                                      setEditingColumnValue(col.name);
                                    }}
                                    onSaveEdit={() => onSaveColumnName(col.id)}
                                    onCancelEdit={() => {
                                      setEditingColumnId(null);
                                      setEditingColumnValue("");
                                    }}
                                    onChange={setEditingColumnValue}
                                    onDelete={() => onDeleteColumn(col.id)}
                                    onHide={() => onHideColumn(col.id)}
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

                              {/* Fixed columns */}
                              <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase">Job</th>
                              <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase">Applied</th>
                              <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase">Resume</th>
                            </tr>
                          </thead>

                          <tbody>
                            {rows.length === 0 ? (
                              <tr>
                                <td colSpan={visibleColumns.length + 5} className="px-4 py-8 text-sm text-stone-400 text-center">
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
                            <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase">Job</th>
                            <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase">Applied</th>
                            <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase">Resume</th>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-stone-900">Add Column</h3>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700">Column name</label>
                  <input
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    placeholder="e.g. Interview Score"
                    className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-400"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700">Column type</label>
                  <select
                    value={newColumnType}
                    onChange={(e) => setNewColumnType(e.target.value as any)}
                    className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-400"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="status">Status</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddColumnModal(false);
                    setNewColumnName("");
                    setNewColumnType("text");
                  }}
                  className="h-9 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  onClick={onAddColumn}
                  disabled={isPending || !newColumnName.trim()}
                  className="h-9 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
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
            onClose={() => setEditLabelsColumnId(null)}
          />
        )}

        {/* Bulk action bar */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 z-50 w-[min(920px,calc(100%-24px))] -translate-x-1/2 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                  className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none"
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
                  className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
                >
                  Delete
                </button>

                <button
                  onClick={clearSelection}
                  disabled={isPending}
                  className="h-9 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
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
  isEditing,
  editValue,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onChange,
  onDelete,
  onHide,
  onAddRight,
}: {
  column: BoardColumn;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onChange: (val: string) => void;
  onDelete: () => void;
  onHide: () => void;
  onAddRight: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-${column.id}`,
    disabled: isEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [menuOpen, setMenuOpen] = useState(false);
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
    <th
      ref={setNodeRef}
      style={style}
      className="group px-4 py-2 text-xs font-medium text-stone-700 border-r border-stone-200 last:border-r-0"
      {...attributes}
    >
      <div className="flex items-center gap-2">
        {isEditing ? (
          <input
            value={editValue}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="h-7 w-32 rounded border border-stone-300 px-2 text-xs outline-none focus:border-stone-500"
            autoFocus
            onFocus={(e) => e.target.select()}
          />
        ) : (
          <>
            {/* Kebab menu button on LEFT */}
            {!column.is_system && (
              <button
                ref={menuButtonRef}
                onClick={() => setMenuOpen(!menuOpen)}
                className="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-stone-900 transition-opacity text-xs font-bold"
              >
                ⋮
              </button>
            )}

            <button
              onClick={onStartEdit}
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
                onHide();
                setMenuOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              Hide column
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
                onStartEdit();
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
    cellEls.push(
      <td key={col.id} className="px-4 py-2 border-r border-stone-100 last:border-r-0">
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

  // Fixed columns
  cellEls.push(
    <td key="__job__" className="px-4 py-2 text-sm text-stone-600 border-r border-stone-100">
      {applicant.jobs?.title ?? "—"}
    </td>
  );
  cellEls.push(
    <td key="__applied__" className="px-4 py-2 text-sm text-stone-600 border-r border-stone-100">
      {new Date(applicant.created_at).toLocaleDateString()}
    </td>
  );
  cellEls.push(
    <td key="__resume__" className="px-4 py-2 text-sm">
      {applicant.resume_path ? (
        <a
          href={`/api/resumes/view?applicantId=${applicant.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          View
        </a>
      ) : (
        <span className="text-stone-300">—</span>
      )}
    </td>
  );

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
          className="h-8 w-full rounded border border-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
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
          className="h-8 w-full rounded border border-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
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
          className="h-8 w-full rounded border border-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
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
    const selectedLabel = labels.find((l) => l.id === value);

    return (
      <div className="relative">
        <select
          value={value ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "__edit_labels__") {
              onEditLabels();
            } else {
              startTransition(() => onUpdate(val || null));
            }
          }}
          className="h-8 w-full appearance-none rounded border border-transparent px-2 pr-6 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
          style={{
            backgroundColor: selectedLabel?.color ? `${selectedLabel.color}20` : "transparent",
            color: selectedLabel?.color ?? "#000",
          }}
        >
          <option value="">—</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.label}
            </option>
          ))}
          <option disabled>──────</option>
          <option value="__edit_labels__">✏️ Edit labels</option>
        </select>
        {selectedLabel && (
          <div
            className="pointer-events-none absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: selectedLabel.color }}
          />
        )}
      </div>
    );
  }

  return <span className="text-stone-300">—</span>;
}

// ===== Status Labels Editor =====

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
  const [editLabelValue, setEditLabelValue] = useState("");
  const [editLabelColor, setEditLabelColor] = useState("#6b7280");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#6b7280");

  function onAddLabel() {
    if (!newLabel.trim()) return;

    startTransition(async () => {
      await createStatusLabel(companyId, jobId, columnId, newLabel.trim(), newColor);
      setNewLabel("");
      setNewColor("#6b7280");
    });
  }

  function onUpdateLabel(labelId: string) {
    if (!editLabelValue.trim()) return;

    startTransition(async () => {
      await updateStatusLabel(companyId, jobId, labelId, {
        label: editLabelValue.trim(),
        color: editLabelColor,
      });
      setEditingLabelId(null);
    });
  }

  function onDeleteLabel(labelId: string) {
    const ok = confirm("Delete this label?");
    if (!ok) return;

    startTransition(async () => {
      await deleteStatusLabel(companyId, jobId, labelId);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-stone-900">Edit Status Labels</h3>

        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {labels.map((label) => (
            <div key={label.id} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
              {editingLabelId === label.id ? (
                <>
                  <input
                    type="color"
                    value={editLabelColor}
                    onChange={(e) => setEditLabelColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border-0"
                  />
                  <input
                    value={editLabelValue}
                    onChange={(e) => setEditLabelValue(e.target.value)}
                    className="flex-1 rounded-lg border border-stone-300 px-2 py-1 text-sm outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => onUpdateLabel(label.id)}
                    className="rounded-lg bg-stone-900 px-3 py-1 text-sm text-white hover:bg-stone-800"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingLabelId(null)}
                    className="rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="h-4 w-4 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="flex-1 text-sm font-medium text-stone-900">{label.label}</span>
                  <button
                    onClick={() => {
                      setEditingLabelId(label.id);
                      setEditLabelValue(label.label);
                      setEditLabelColor(label.color);
                    }}
                    className="text-sm text-stone-600 hover:text-stone-900"
                  >
                    Edit
                  </button>
                  <button onClick={() => onDeleteLabel(label.id)} className="text-sm text-red-600 hover:text-red-800">
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border-2 border-dashed border-stone-300 p-3">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border-0"
          />
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New label name"
            className="flex-1 rounded-lg border border-stone-300 px-2 py-1 text-sm outline-none"
          />
          <button
            onClick={onAddLabel}
            disabled={isPending || !newLabel.trim()}
            className="rounded-lg bg-stone-900 px-3 py-1 text-sm text-white hover:bg-stone-800 disabled:opacity-60"
          >
            Add
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={onClose}
            className="h-9 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
