"use client";

import { useMemo, useState, useTransition } from "react";
import {
  bulkDeleteApplicants,
  bulkMoveApplicants,
  createBoardColumn,
  createGroup,
  createStatusLabel,
  deleteBoardColumn,
  deleteStatusLabel,
  updateBoardCell,
  updateApplicantStatus,
  updateBoardColumn,
  updateStatusLabel,
} from "./actions";

type Group = {
  id: string;
  name: string;
  sort_order: number;
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
};

type BoardColumn = {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "file" | "status";
  is_system: boolean;
  sort_order: number;
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

const STATUS_OPTIONS = ["applied", "screening", "interview", "offer", "hired", "rejected"];

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#6b7280", // gray
];

export default function ApplicantsBoard({
  companyId,
  groups,
  applicants,
  columns,
  statusLabels,
  cells,
}: {
  companyId: string;
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
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<"text" | "number" | "date" | "file" | "status">("text");

  // Column menu
  const [columnMenuOpen, setColumnMenuOpen] = useState<string | null>(null);
  const [renameColumnId, setRenameColumnId] = useState<string | null>(null);
  const [renameColumnValue, setRenameColumnValue] = useState("");

  // Status labels editor
  const [editLabelsColumnId, setEditLabelsColumnId] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const applicantsByGroup = useMemo(() => {
    const map = new Map<string, ApplicantRow[]>();
    for (const g of groups) map.set(g.id, []);
    for (const a of applicants) {
      if (a.group_id && map.has(a.group_id)) map.get(a.group_id)!.push(a);
    }
    return map;
  }, [groups, applicants]);

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
    if (!name) return;

    startTransition(async () => {
      await createGroup(companyId, name);
      setNewGroupName("");
    });
  }

  function onAddColumn() {
    const name = newColumnName.trim();
    if (!name) return;

    startTransition(async () => {
      await createBoardColumn(companyId, name, newColumnType);
      setShowAddColumn(false);
      setNewColumnName("");
      setNewColumnType("text");
    });
  }

  function onRenameColumn(columnId: string) {
    const name = renameColumnValue.trim();
    if (!name) return;

    startTransition(async () => {
      await updateBoardColumn(companyId, columnId, { name });
      setRenameColumnId(null);
      setRenameColumnValue("");
    });
  }

  function onDeleteColumn(columnId: string) {
    const ok = confirm("Delete this column? All data in this column will be lost.");
    if (!ok) return;

    startTransition(async () => {
      await deleteBoardColumn(companyId, columnId);
    });
  }

  /**
   * Get cell value for a column.
   * For system columns, maps to applicant fields.
   * For custom columns, reads from board_cells.
   */
  function getCellValue(applicant: ApplicantRow, column: BoardColumn) {
    // System columns map to applicant data
    if (column.is_system) {
      if (column.name === "Name") return applicant.full_name;
      if (column.name === "Email") return applicant.email;
      if (column.name === "Phone") return applicant.phone;
      if (column.name === "Status") return applicant.status;
      return null;
    }

    // Custom columns read from board_cells
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
      await updateBoardCell(companyId, applicantId, columnId, columnType, value);
    });
  }

  return (
    <div className="space-y-10 pb-28">
      {/* Header: Groups + Add Column */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-stone-700">Groups</div>
          <div className="text-xs text-stone-400">
            Like Monday groups — applicants live inside a group.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="New group name"
            className="h-10 w-56 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-300"
          />
          <button
            onClick={onCreateGroup}
            disabled={isPending}
            className="h-10 rounded-xl bg-stone-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-stone-800 disabled:opacity-60"
          >
            Create group
          </button>
        </div>
      </div>

      {/* Add Column Button */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowAddColumn(true)}
          className="flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          <span className="text-lg leading-none">+</span>
          <span>Add column</span>
        </button>
      </div>

      {/* Add Column Modal */}
      {showAddColumn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-stone-900">Add Column</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-stone-700">Column name</label>
                <input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="e.g. Interview Score"
                  className="mt-1 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-300"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700">Column type</label>
                <select
                  value={newColumnType}
                  onChange={(e) => setNewColumnType(e.target.value as any)}
                  className="mt-1 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-300"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="file">File</option>
                  <option value="status">Status</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddColumn(false);
                  setNewColumnName("");
                  setNewColumnType("text");
                }}
                className="h-10 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={onAddColumn}
                disabled={isPending || !newColumnName.trim()}
                className="h-10 rounded-xl bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
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

      {/* Groups list */}
      {groups.map((g) => {
        const rows = applicantsByGroup.get(g.id) ?? [];
        return (
          <section key={g.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold text-stone-900">{g.name}</h2>
                <span className="text-sm text-stone-400">({rows.length})</span>
              </div>

              <button
                onClick={() => toggleAllInGroup(g.id, rows)}
                className="text-sm text-stone-500 hover:text-stone-800"
              >
                Select all
              </button>
            </div>

            <div className="overflow-x-auto overflow-y-visible rounded-2xl border border-stone-100 bg-white shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-stone-50 text-xs tracking-wide text-stone-400">
                  <tr>
                    <th className="w-10 px-5 py-4"></th>

                    {/* Dynamic board columns (includes system columns: Name, Email, Phone, Status) */}
                    {columns.map((col) => (
                      <th key={col.id} className="relative px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="uppercase">{col.name}</span>
                          <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                            {col.type}
                          </span>
                          {col.is_system && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              SYSTEM
                            </span>
                          )}
                          <button
                            onClick={() =>
                              setColumnMenuOpen(columnMenuOpen === col.id ? null : col.id)
                            }
                            className="text-stone-400 hover:text-stone-700"
                          >
                            ⋮
                          </button>
                        </div>

                        {/* Column menu dropdown */}
                        {columnMenuOpen === col.id && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
                            {col.is_system ? (
                              <div className="px-4 py-2 text-xs text-stone-400">
                                System columns cannot be modified
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setRenameColumnId(col.id);
                                    setRenameColumnValue(col.name);
                                    setColumnMenuOpen(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                                >
                                  Rename
                                </button>
                                <button
                                  onClick={() => {
                                    setColumnMenuOpen(null);
                                    onDeleteColumn(col.id);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </th>
                    ))}

                    {/* Fixed columns not in board schema */}
                    <th className="px-5 py-4">JOB</th>
                    <th className="px-5 py-4">APPLIED</th>
                    <th className="px-5 py-4">RESUME</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-stone-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={1 + columns.length + 3} className="px-5 py-8 text-sm text-stone-400">
                        No applicants in this group yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((a) => (
                      <tr key={a.id} className="hover:bg-stone-50/60">
                        <td className="px-5 py-4">
                          <input
                            type="checkbox"
                            checked={!!selected[a.id]}
                            onChange={() => toggleRow(a.id)}
                            className="h-4 w-4 rounded border-stone-300"
                          />
                        </td>

                        {/* Dynamic column cells (system + custom) */}
                        {columns.map((col) => (
                          <td key={col.id} className="px-5 py-4">
                            <CellRenderer
                              applicant={a}
                              column={col}
                              value={getCellValue(a, col)}
                              labels={labelsByColumn.get(col.id) ?? []}
                              onUpdate={(val) => onUpdateCell(a.id, col.id, col.type as any, val)}
                              onEditLabels={() => setEditLabelsColumnId(col.id)}
                            />
                          </td>
                        ))}

                        {/* Fixed columns */}
                        <td className="px-5 py-4 text-stone-600">{a.jobs?.title ?? "—"}</td>
                        <td className="px-5 py-4 text-stone-600">
                          {new Date(a.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4">
                          {a.resume_path ? (
                            <a
                              className="text-sm text-stone-900 underline underline-offset-4 hover:text-stone-700"
                              href={`/api/resumes/view?applicantId=${a.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Rename column inline modal */}
            {renameColumnId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
                  <h3 className="text-lg font-semibold text-stone-900">Rename Column</h3>
                  <input
                    value={renameColumnValue}
                    onChange={(e) => setRenameColumnValue(e.target.value)}
                    className="mt-4 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-300"
                    autoFocus
                  />
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setRenameColumnId(null);
                        setRenameColumnValue("");
                      }}
                      className="h-10 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => onRenameColumn(renameColumnId)}
                      disabled={isPending || !renameColumnValue.trim()}
                      className="h-10 rounded-xl bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        );
      })}

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(920px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-stone-700">
              <span className="font-semibold">{selectedIds.length}</span> selected
              {isPending && <span className="ml-2 text-stone-400">(working…)</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                onChange={(e) => {
                  const groupId = e.target.value;
                  if (groupId) onMoveToGroup(groupId);
                  e.currentTarget.value = "";
                }}
                className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none"
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
                onClick={() => {
                  alert("Mass email (placeholder). Next step: integrate email provider.");
                }}
                disabled={isPending}
                className="h-10 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
              >
                Mass email
              </button>

              <button
                onClick={onBulkDelete}
                disabled={isPending}
                className="h-10 rounded-xl bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                Delete
              </button>

              <button
                onClick={clearSelection}
                disabled={isPending}
                className="h-10 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Cell Renderer Component =====

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

  // System columns are read-only (display applicant data)
  if (column.is_system) {
    if (column.type === "text") {
      return <span className="text-sm text-stone-600">{value || "—"}</span>;
    }
    if (column.type === "status") {
      // System status column uses board status labels
      const selectedLabel = labels.find((l) => l.label.toLowerCase() === value?.toLowerCase());
      return (
        <div className="flex items-center gap-2">
          {selectedLabel && (
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: selectedLabel.color }}
            />
          )}
          <span className="text-sm text-stone-600">{value || "—"}</span>
        </div>
      );
    }
    return <span className="text-sm text-stone-600">{value || "—"}</span>;
  }

  // Custom columns are editable
  if (column.type === "text") {
    return (
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          startTransition(() => onUpdate(val));
        }}
        className="h-9 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-300"
        placeholder="—"
      />
    );
  }

  if (column.type === "number") {
    return (
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const val = e.target.value ? parseFloat(e.target.value) : null;
          startTransition(() => onUpdate(val));
        }}
        className="h-9 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-300"
        placeholder="—"
      />
    );
  }

  if (column.type === "date") {
    return (
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          startTransition(() => onUpdate(val));
        }}
        className="h-9 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-300"
      />
    );
  }

  if (column.type === "file") {
    return (
      <div className="text-sm text-stone-400">
        <span>File upload (TODO)</span>
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
          className="h-9 w-full appearance-none rounded-xl border border-stone-200 bg-white px-3 pr-8 text-sm outline-none focus:border-stone-300"
          style={{
            backgroundColor: selectedLabel?.color
              ? `${selectedLabel.color}20`
              : "white",
            color: selectedLabel?.color ?? "#6b7280",
          }}
        >
          <option value="">—</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.label}
            </option>
          ))}
          <option value="__edit_labels__" disabled={labels.length === 0}>
            ──────────
          </option>
          <option value="__edit_labels__">✏️ Edit labels</option>
        </select>
        {selectedLabel && (
          <div
            className="pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: selectedLabel.color }}
          />
        )}
      </div>
    );
  }

  return <span className="text-stone-300">—</span>;
}

// ===== Status Labels Editor Modal =====

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
  const [editLabelValue, setEditLabelValue] = useState("");
  const [editLabelColor, setEditLabelColor] = useState("#6b7280");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#6b7280");

  function onAddLabel() {
    if (!newLabel.trim()) return;

    startTransition(async () => {
      await createStatusLabel(companyId, columnId, newLabel.trim(), newColor);
      setNewLabel("");
      setNewColor("#6b7280");
    });
  }

  function onUpdateLabel(labelId: string) {
    if (!editLabelValue.trim()) return;

    startTransition(async () => {
      await updateStatusLabel(companyId, labelId, {
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
      await deleteStatusLabel(companyId, labelId);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-stone-900">Edit Status Labels</h3>

        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3"
            >
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
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1 text-sm font-medium text-stone-900">
                    {label.label}
                  </span>
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
                  <button
                    onClick={() => onDeleteLabel(label.id)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new label */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-dashed border-stone-300 p-3">
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

        {/* Color presets */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-stone-500">Quick colors:</div>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setNewColor(color)}
                className="h-6 w-6 rounded border border-stone-200 transition-transform hover:scale-110"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={onClose}
            className="h-10 rounded-xl bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
