"use client";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import type React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
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
} from "./actions";
import { statusColorArray } from "@/lib/brand-colors";
import { StatusDropdown } from "@/components/ui/status-dropdown";
import { ColorPicker } from "@/components/ui/color-picker";
import { formatPhone } from "@/lib/validation/columnValidation";
import type { BoardColumn, BoardCell, BoardStatusLabel } from "@/lib/types";

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

// Using BoardColumn, BoardCell, BoardStatusLabel from @/lib/types which includes all column types
type StatusLabel = BoardStatusLabel; // Alias for compatibility with existing code

const PRESET_COLORS = statusColorArray.map(c => c.value);

export default function ApplicantsBoard({
  companyId,
  boardId,
  groups,
  applicants,
  columns,
  statusLabels,
  cells,
}: {
  companyId: string;
  boardId?: string;
  groups: Group[];
  applicants: ApplicantRow[];
  columns: BoardColumn[];
  statusLabels: StatusLabel[];
  cells: BoardCell[];
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [newGroupName, setNewGroupName] = useState("");

  // Add column modal
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<"text" | "number" | "date" | "file" | "status" | "email" | "phone" | "location">("text");
  const [addColumnError, setAddColumnError] = useState<string | null>(null);

  // Status labels editor
  const [editLabelsColumnId, setEditLabelsColumnId] = useState<string | null>(null);

  // Row menu
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);

  // Group color picker
  const [colorPickerGroupId, setColorPickerGroupId] = useState<string | null>(null);

  // Local state for optimistic updates
  const [localColumns, setLocalColumns] = useState(columns);
  const [localApplicants, setLocalApplicants] = useState(applicants);

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
    const map = new Map<string, ApplicantRow[]>();
    for (const g of groups) map.set(g.id, []);
    for (const a of localApplicants) {
      if (a.group_id && map.has(a.group_id)) map.get(a.group_id)!.push(a);
    }
    // Sort by position
    for (const [, rows] of map) {
      rows.sort((a, b) => a.position - b.position);
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

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
            await reorderColumns(companyId, newOrder[i].id, i);
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
            await reorderApplicants(companyId, activeRowId, newIndex, activeRow.group_id);
          });
        }
      }
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
      await bulkDeleteApplicants(companyId, selectedIds);
      clearSelection();
    });
  }

  function onMoveToGroup(groupId: string) {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      await bulkMoveApplicants(companyId, selectedIds, groupId);
      clearSelection();
    });
  }

  function onCreateGroup() {
    const name = newGroupName.trim();
    if (!name || !boardId) return;

    startTransition(async () => {
      await createGroup(companyId, boardId, name);
      setNewGroupName("");
    });
  }

  function onToggleGroupCollapse(groupId: string, currentCollapsed: boolean) {
    if (!boardId) return;
    startTransition(async () => {
      await toggleGroupCollapse(companyId, boardId, groupId, !currentCollapsed);
    });
  }

  function onUpdateGroupColor(groupId: string, color: string) {
    if (!boardId) return;
    startTransition(async () => {
      await updateGroupColor(companyId, boardId, groupId, color);
      setColorPickerGroupId(null);
    });
  }

  function onAddColumn() {
    const name = newColumnName.trim();
    if (!name) return;

    setAddColumnError(null);

    startTransition(async () => {
      const result = await createBoardColumn(companyId, name, newColumnType);

      if (!result.success) {
        setAddColumnError(result.error || "Failed to create column");
        return;
      }

      setShowAddColumnModal(false);
      setNewColumnName("");
      setNewColumnType("text");
      setAddColumnError(null);
    });
  }

  function onSaveColumnName(columnId: string, newName: string) {
    startTransition(async () => {
      await updateBoardColumn(companyId, columnId, { name: newName });
    });
  }

  function onDeleteColumn(columnId: string) {
    const ok = confirm("Delete this column? All data in this column will be lost.");
    if (!ok) return;

    startTransition(async () => {
      await deleteBoardColumn(companyId, columnId);
    });
  }

  function onMoveApplicant(applicantId: string, groupId: string) {
    startTransition(async () => {
      await moveApplicant(companyId, applicantId, groupId);
      setRowMenuOpen(null);
    });
  }

  function onDeleteApplicant(applicantId: string) {
    const ok = confirm("Delete this applicant? This cannot be undone.");
    if (!ok) return;

    startTransition(async () => {
      await deleteApplicant(companyId, applicantId);
      setRowMenuOpen(null);
    });
  }

  function onDuplicateApplicant(applicantId: string) {
    startTransition(async () => {
      await duplicateApplicant(companyId, applicantId);
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
    if (column.type === "file") {
      // For file type, combine path and metadata
      if (cell.value_file_path || cell.value_text) {
        const metadata = cell.value_text ? JSON.parse(cell.value_text) : null;
        // Generate Supabase storage URL for the file
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const url = cell.value_file_path
          ? `${supabaseUrl}/storage/v1/object/public/files/${cell.value_file_path}`
          : null;
        return {
          path: cell.value_file_path,
          metadata: metadata,
          url: url,
        };
      }
      return null;
    }
    return null;
  }

  function onUpdateCell(applicantId: string, columnId: string, columnType: "text" | "number" | "date" | "status" | "email" | "phone" | "location" | "file", value: any) {
    startTransition(async () => {
      await updateBoardCell(companyId, applicantId, columnId, columnType, value);
    });
  }

  if (!mounted) {
    return <div className="min-h-[60vh] bg-stone-50" />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden bg-stone-50">
        {/* Board content - single horizontal scroll */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-max p-6">
            {/* Groups */}
            <div className="space-y-4">
              {groups.map((g) => {
                const rows = applicantsByGroup.get(g.id) ?? [];
                return (
                  <section key={g.id} className="space-y-2">
                    {/* Group header with color */}
                    <div className="flex items-center gap-3 px-2">
                      <button
                        onClick={() => onToggleGroupCollapse(g.id, g.is_collapsed)}
                        className="text-stone-600 hover:text-stone-900 text-sm"
                      >
                        {g.is_collapsed ? "▶" : "▼"}
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setColorPickerGroupId(colorPickerGroupId === g.id ? null : g.id)}
                          className="h-4 w-4 rounded cursor-pointer hover:ring-2 hover:ring-stone-300 transition"
                          style={{ backgroundColor: g.color }}
                        />
                        {/* Color picker dropdown */}
                        {colorPickerGroupId === g.id && (
                          <div className="absolute left-0 top-6 z-50 rounded-lg border border-stone-200 bg-white p-3 shadow-xl">
                            <div className="grid grid-cols-8 gap-2">
                              {PRESET_COLORS.map((color) => (
                                <button
                                  key={color}
                                  onClick={() => onUpdateGroupColor(g.id, color)}
                                  className="h-6 w-6 rounded border border-stone-200 hover:scale-110 transition-transform"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <h2 className="text-base font-semibold text-stone-900">{g.name}</h2>
                      <span className="text-sm text-stone-400">({rows.length})</span>
                    </div>

                    {/* Group table */}
                    {!g.is_collapsed && (
                      <div className="overflow-visible rounded-lg border border-stone-200 bg-white">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-stone-50/80">
                            <tr className="border-b border-stone-200">
                              <th className="sticky left-0 z-10 w-10 bg-stone-50/80 px-4 py-2"></th>

                              {/* Sortable columns */}
                              <SortableContext
                                items={localColumns.map((c) => `col-${c.id}`)}
                                strategy={horizontalListSortingStrategy}
                              >
                                {localColumns.map((col) => (
                                  <SortableColumnHeader
                                    key={col.id}
                                    column={col}
                                    onSaveEdit={(newName) => onSaveColumnName(col.id, newName)}
                                    onDelete={() => onDeleteColumn(col.id)}
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
                                <td colSpan={localColumns.length + 5} className="px-4 py-8 text-sm text-stone-400 text-center">
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
                              </SortableContext>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })}

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
                    onChange={(e) => {
                      setNewColumnName(e.target.value);
                      setAddColumnError(null);
                    }}
                    placeholder="e.g. Interview Score"
                    className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-400"
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
                    className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-400"
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
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddColumnModal(false);
                    setNewColumnName("");
                    setNewColumnType("text");
                    setAddColumnError(null);
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
      </div>
    </DndContext>
  );
}

// ===== Sortable Column Header =====

function SortableColumnHeader({
  column,
  onSaveEdit,
  onDelete,
}: {
  column: BoardColumn;
  onSaveEdit: (newName: string) => void;
  onDelete: () => void;
}) {
  // Local edit state - matches CellRenderer pattern exactly
  const [localValue, setLocalValue] = useState(column.name);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-${column.id}`,
    disabled: isEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="px-4 py-2 text-xs font-medium text-stone-700 border-r border-stone-200 last:border-r-0"
      {...attributes}
    >
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
  onUpdateCell: (colId: string, colType: "text" | "number" | "date" | "status" | "email" | "phone" | "location" | "file", val: any) => void;
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

  const cellEls: React.ReactNode[] = [];

  // Sticky left cell (checkbox + row menu)
  cellEls.push(
    <td
      key="__sticky__"
      className="sticky left-0 z-10 bg-white group-hover:bg-stone-50/60 px-4 py-2 border-r border-stone-100"
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setRowMenuOpen(!rowMenuOpen)}
            className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-700 transition text-sm"
          >
            ⋮
          </button>
          {rowMenuOpen ? (
            <div className="absolute left-0 top-6 z-50 w-40 rounded-lg border border-stone-200 bg-white py-1 shadow-xl">
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
          ) : null}
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

// ===== File Cell Component =====

function FileCell({
  value,
  applicant,
  column,
  onUpdate,
  isPending,
  startTransition,
}: {
  value: any;
  applicant: ApplicantRow;
  column: BoardColumn;
  onUpdate: (val: any) => void;
  isPending: boolean;
  startTransition: any;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse file metadata from value
  const fileData = value ? (typeof value === 'string' ? JSON.parse(value) : value) : null;
  const fileName = fileData?.metadata?.name || fileData?.name;
  const fileUrl = fileData?.url;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Create FormData for upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', column.company_id);
      formData.append('boardId', column.board_id);
      formData.append('columnId', column.id);
      formData.append('applicantId', applicant.id);

      // Upload file via API
      const response = await fetch('/api/board/upload-file', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Update cell with file path and metadata
      startTransition(() => {
        onUpdate({
          path: result.path,
          metadata: result.metadata,
          url: result.url,
        });
      });

    } catch (err: any) {
      console.error('[FileCell] Upload error:', err);
      setError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = () => {
    startTransition(() => {
      onUpdate(null);
    });
  };

  if (uploading || isPending) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />
        <span className="text-sm text-stone-500">Uploading...</span>
      </div>
    );
  }

  if (fileName && fileUrl) {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-blue-600 hover:underline truncate max-w-[150px]"
          title={fileName}
        >
          {fileName}
        </a>
        <button
          onClick={handleDelete}
          className="text-stone-400 hover:text-red-600 text-xs"
          title="Delete file"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.txt,.json,.html"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="text-sm text-stone-600 hover:text-stone-900 hover:underline"
      >
        Choose file
      </button>
      {error && (
        <div className="text-xs text-red-600 mt-1">{error}</div>
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
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => startTransition(() => onUpdate(e.target.value))}
        className="h-8 w-full rounded border border-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
        placeholder="—"
      />
    );
  }

  if (column.type === "number") {
    return (
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => startTransition(() => onUpdate(e.target.value ? parseFloat(e.target.value) : null))}
        className="h-8 w-full rounded border border-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
        placeholder="—"
      />
    );
  }

  if (column.type === "date") {
    return (
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => startTransition(() => onUpdate(e.target.value))}
        className="h-8 w-full rounded border border-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
      />
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
      <input
        type="email"
        value={value ?? ""}
        onChange={(e) => startTransition(() => onUpdate(e.target.value))}
        className="h-8 w-full rounded border border-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
        placeholder="email@example.com"
      />
    );
  }

  if (column.type === "phone") {
    return (
      <input
        type="tel"
        value={value ? formatPhone(value) : ""}
        onChange={(e) => startTransition(() => onUpdate(e.target.value))}
        className="h-8 w-full rounded border border-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
        placeholder="(123) 456-7890"
      />
    );
  }

  if (column.type === "location") {
    return (
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => startTransition(() => onUpdate(e.target.value))}
        className="h-8 w-full rounded border border-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-blue-500"
        placeholder="City, State"
      />
    );
  }

  if (column.type === "file") {
    return (
      <FileCell
        value={value}
        applicant={applicant}
        column={column}
        onUpdate={onUpdate}
        isPending={isPending}
        startTransition={startTransition}
      />
    );
  }

  return <span className="text-stone-300">—</span>;
}

// ===== Status Labels Editor (Monday.com-style inline editing) =====

function StatusLabelsEditor({
  companyId,
  columnId,
  labels,
  onClose,
}: {
  companyId: string;
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
  }, [columnId]);

  function onUpdateLabel(labelId: string) {
    const values = editValues[labelId];
    if (!values?.label.trim()) return;

    // Immediately update local state
    setLocalLabels((prev) =>
      prev.map((label) =>
        label.id === labelId
          ? { ...label, label: values.label.trim(), color: values.color }
          : label
      )
    );

    startTransition(async () => {
      try {
        await updateStatusLabel(companyId, labelId, {
          label: values.label.trim(),
          color: values.color,
        });
        setEditingLabelId(null);
        setError(null);
      } catch (err) {
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

    const isFallback = labelToDelete.label.toLowerCase() === "none" || localLabels[0]?.id === labelId;

    if (isFallback) {
      setError("Cannot delete the default label. It is used as a fallback when other labels are deleted.");
      return;
    }

    const ok = confirm(`Delete "${labelToDelete.label}"?`);
    if (!ok) return;

    setLocalLabels((prev) => prev.filter((label) => label.id !== labelId));

    startTransition(async () => {
      try {
        await deleteStatusLabel(companyId, labelId);
        setError(null);
      } catch (err) {
        setLocalLabels((prev) => [...prev, labelToDelete].sort((a, b) => a.sort_order - b.sort_order));
        setError(err instanceof Error ? err.message : "Failed to delete label");
      }
    });
  }

  function onAddLabel() {
    if (!newLabel.trim()) return;

    startTransition(async () => {
      try {
        const created = await createStatusLabel(companyId, columnId, newLabel.trim(), newColor);
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

  const fallbackLabel = localLabels.find((l) => l.label.toLowerCase() === "none") || localLabels[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[10px] border border-stone-200 bg-white p-6 shadow-2xl">
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

                {/* Delete button - disabled for fallback */}
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
                      onUpdateLabel(label.id);
                      setShowColorPickerForId(null);
                    }}
                    inline
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
