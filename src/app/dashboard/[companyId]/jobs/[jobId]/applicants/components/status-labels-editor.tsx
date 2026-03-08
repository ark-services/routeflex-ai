"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { GripVertical } from "lucide-react";
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { STATUS_COLOR_PALETTE } from "@/lib/brand-colors";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  createStatusLabel,
  deleteStatusLabel,
  updateStatusLabel,
  reorderStatusLabels,
  getColumnFormOptions,
} from "../actions";
import type { StatusLabel } from "./types";

// Returns the first palette color that isn't already taken by an existing label.
// This is the core fix for the uniqueness-conflict UX problem: new labels always
// start with a safe color, so users never hit a color-conflict error unless they
// intentionally choose an in-use color (which the picker prevents anyway).
function getNextAvailableColor(usedColors: string[]): string {
  const used = new Set(usedColors);
  for (const { value } of STATUS_COLOR_PALETTE) {
    if (!used.has(value)) return value;
  }
  // All 25 palette slots are taken -- fall back to last color.
  // Server will reject; user must delete a label to free a slot.
  return STATUS_COLOR_PALETTE[STATUS_COLOR_PALETTE.length - 1].value;
}

/** Sortable row used inside StatusLabelsEditor for drag-to-reorder. */
function SortableLabelRow({
  label,
  isFallback,
  isFormLinked,
  editValue,
  inputRefs,
  localLabels,
  editValues,
  onUpdateLabel,
  onDeleteLabel,
  setEditValues,
  setEditingLabelId,
}: {
  label: StatusLabel;
  isFallback: boolean;
  isFormLinked: boolean;
  editValue: { label: string; color: string } | undefined;
  inputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  localLabels: StatusLabel[];
  editValues: Record<string, { label: string; color: string }>;
  onUpdateLabel: (labelId: string, overrideColor?: string) => void;
  onDeleteLabel: (labelId: string) => void;
  setEditValues: React.Dispatch<React.SetStateAction<Record<string, { label: string; color: string }>>>;
  setEditingLabelId: (id: string | null) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: label.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-rf-surface-page transition-colors min-w-0"
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-rf-ink-300 hover:text-rf-ink-500 transition-colors touch-none"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <ColorPicker
        size="sm"
        value={editValue?.color || label.color}
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
        value={editValue?.label || label.label}
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
      {isFormLinked && (
        <span
          className="shrink-0 px-1.5 py-0.5 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 rounded"
          title="This label is synced from a form dropdown -- deleting it may cause it to be re-added"
        >
          Form
        </span>
      )}
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
}

export function StatusLabelsEditor({
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
  // Form-linked options: labels whose text matches a form dropdown option
  const [formLinkedOptions, setFormLinkedOptions] = useState<Set<string>>(new Set());

  useEffect(() => {
    getColumnFormOptions(companyId, jobId, columnId)
      .then((options) => {
        setFormLinkedOptions(new Set(options.map((o) => o.toLowerCase().trim())));
      })
      .catch(() => {});
  }, [companyId, jobId, columnId]);

  const labelDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
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
    // not here -- so we don't race-condition against the next focused label.
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

    const currentText = (editValues[labelId]?.label || labelToDelete.label).toLowerCase().trim();
    const isLinkedToForm = formLinkedOptions.has(currentText);
    const confirmMsg = isLinkedToForm
      ? `"${labelToDelete.label}" is synced from a form dropdown. Deleting it here may cause it to be re-added automatically when the next applicant submits the form. Delete anyway?`
      : `Delete "${labelToDelete.label}"?`;
    const ok = confirm(confirmMsg);
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
        // Auto-select the next available color and show a subtle inline hint -- not a
        // red banner, since this is recoverable and the user didn't do anything wrong.
        if (msg.toLowerCase().includes("color") || msg.includes("23505")) {
          const usedColors = localLabels.map((l) => editValues[l.id]?.color || l.color);
          setNewColor(getNextAvailableColor(usedColors));
          setColorHint("Color conflict -- a new color was auto-selected. Try again.");
        } else {
          setError(msg);
        }
      }
    });
  }

  // Drag-end handler for label reordering
  function handleLabelDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localLabels.findIndex((l) => l.id === active.id);
    const newIndex = localLabels.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(localLabels, oldIndex, newIndex);
    setLocalLabels(reordered);
    startTransition(async () => {
      try {
        await reorderStatusLabels(
          companyId,
          jobId,
          reordered.map((l, i) => ({ id: l.id, sort_order: i }))
        );
      } catch {
        setLocalLabels(localLabels);
      }
    });
  }

  // Determine fallback label (first label or one named "None")
  const fallbackLabel = localLabels.find((l) => l.label.toLowerCase() === "none") || localLabels[0];

  // Derived color-availability values used to gate the "Add" row and button.
  // These are recomputed on every render so they always reflect pending local edits.
  const usedColorsForNew = localLabels.map((l) => editValues[l.id]?.color || l.color);
  // True when every palette slot is occupied -- user must free one before adding.
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

        {/* Labels list with drag-to-reorder */}
        <DndContext
          sensors={labelDndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleLabelDragEnd}
        >
          <SortableContext
            items={localLabels.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="mt-4 flex flex-col gap-0.5">
              {localLabels.map((label) => (
                <SortableLabelRow
                  key={label.id}
                  label={label}
                  isFallback={fallbackLabel?.id === label.id}
                  isFormLinked={formLinkedOptions.has(
                    (editValues[label.id]?.label || label.label).toLowerCase().trim()
                  )}
                  editValue={editValues[label.id]}
                  inputRefs={inputRefs}
                  localLabels={localLabels}
                  editValues={editValues}
                  onUpdateLabel={onUpdateLabel}
                  onDeleteLabel={onDeleteLabel}
                  setEditValues={setEditValues}
                  setEditingLabelId={setEditingLabelId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* "Add new label" row -- hidden and replaced with a message when all 25 palette
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
              {/* Popover ColorPicker -- floats over content, no layout shift.
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
            {/* Race-condition hint -- shown below the add row, not inside the picker */}
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
