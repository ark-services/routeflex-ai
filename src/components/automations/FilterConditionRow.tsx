"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Column, Group, FilterCondition } from "./automations-types";
import { COLUMN_CONDITIONS, getColCategory } from "./automations-types";
import { ColumnPicker, StatusLabelPicker, GroupPicker } from "./Pickers";

export function FilterConditionRow({
  condition,
  columns,
  groups,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  columns: Column[];
  groups: Group[];
  onChange: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
}) {
  // Sentinel used when the user picks "Group membership" in the column picker
  const SENTINEL_GROUP = "__group__";

  const isGroupCondition = condition.type === "item_in_group";
  const effectiveColumnId = isGroupCondition ? SENTINEL_GROUP : condition.column_id;

  const selectedColumn = columns.find((c) => c.id === condition.column_id);
  const colCategory = getColCategory(selectedColumn);
  const availableConditions = colCategory ? (COLUMN_CONDITIONS[colCategory] ?? []) : [];

  const isNoValueCondition = condition.type === "is_empty" || condition.type === "is_not_empty";
  const isStatusCondition  = condition.type === "status_is" || condition.type === "status_is_not";
  const isTextCondition    = condition.type === "text_equals" || condition.type === "text_contains";
  const isNumberCondition  = condition.type.startsWith("number_");
  const isDateCondition    = condition.type.startsWith("date_");

  function handleColumnSelect(id: string) {
    if (id === SENTINEL_GROUP) {
      onChange({ type: "item_in_group", column_id: undefined, value: "" });
      return;
    }
    const col = columns.find((c) => c.id === id);
    const cat = getColCategory(col);
    const firstCond = cat ? (COLUMN_CONDITIONS[cat]?.[0]?.value ?? "is_not_empty") : "is_not_empty";
    onChange({ column_id: id, type: firstCond, value: "" });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-rf-surface-card border border-rf-blue-tint rounded px-2 py-1.5">

      {/* 1. Column picker — all columns + "Group membership" sentinel */}
      <ColumnPicker
        columns={columns}
        selectedId={effectiveColumnId}
        onSelect={handleColumnSelect}
        placeholder="column"
        extraOptions={[{ id: SENTINEL_GROUP, name: "Group membership" }]}
      />

      {/* 2. Condition dropdown — only shown after a column is selected */}
      {!isGroupCondition && condition.column_id && availableConditions.length > 0 && (
        <select
          value={condition.type}
          onChange={(e) => onChange({ type: e.target.value, value: "" })}
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-rf-surface-card focus:outline-none focus:ring-1 focus:ring-rf-blue"
        >
          {availableConditions.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      )}

      {/* 3. Value input — varies by condition type; hidden for is_empty / is_not_empty */}
      {isGroupCondition && (
        <GroupPicker
          groups={groups}
          selectedId={typeof condition.value === "string" ? condition.value : undefined}
          onSelect={(id) => onChange({ value: id ?? "" })}
          placeholder="group"
        />
      )}

      {!isNoValueCondition && isStatusCondition && condition.column_id && (
        <StatusLabelPicker
          column={selectedColumn}
          selectedId={typeof condition.value === "string" ? condition.value : undefined}
          onSelect={(id) => onChange({ value: id })}
          placeholder="value"
        />
      )}

      {!isNoValueCondition && isTextCondition && (
        <input
          type="text"
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="value\u2026"
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-rf-surface-card min-w-[100px] focus:outline-none focus:ring-1 focus:ring-rf-blue"
        />
      )}

      {!isNoValueCondition && isNumberCondition && (
        <input
          type="number"
          value={condition.value === "" ? "" : condition.value}
          onChange={(e) =>
            onChange({ value: e.target.value === "" ? "" : parseFloat(e.target.value) })
          }
          placeholder="0"
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-rf-surface-card w-20 focus:outline-none focus:ring-1 focus:ring-rf-blue"
        />
      )}

      {!isNoValueCondition && isDateCondition && (
        <input
          type="date"
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onChange({ value: e.target.value })}
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-rf-surface-card focus:outline-none focus:ring-1 focus:ring-rf-blue"
        />
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="ml-auto p-1 hover:bg-rf-danger-bg rounded text-gray-400 hover:text-rf-danger transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
