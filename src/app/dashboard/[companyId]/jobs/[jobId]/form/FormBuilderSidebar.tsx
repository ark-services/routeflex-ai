"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  sort_order: number;
  settings: Record<string, any>;
};

type FormBuilderSidebarProps = {
  fields: FormField[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onReorder: (reorderedFields: FormField[]) => void;
};

function SortableFieldItem({
  field,
  index,
  selectedFieldId,
  onSelectField,
}: {
  field: FormField;
  index: number;
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        onClick={() => onSelectField(field.id)}
        className={`w-full flex items-start gap-2 px-2 py-2 rounded-lg text-left transition-colors ${
          selectedFieldId === field.id
            ? "bg-rf-blue-tint text-rf-blue"
            : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 mt-1 flex-shrink-0"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 16">
            <circle cx="3" cy="2.5" r="1.2" />
            <circle cx="9" cy="2.5" r="1.2" />
            <circle cx="3" cy="7" r="1.2" />
            <circle cx="9" cy="7" r="1.2" />
            <circle cx="3" cy="11.5" r="1.2" />
            <circle cx="9" cy="11.5" r="1.2" />
          </svg>
        </div>

        <span className="text-xs font-medium text-gray-400 mt-0.5 flex-shrink-0 w-4 text-right">
          {index + 1}
        </span>

        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${field.settings?.hidden ? "text-gray-400" : ""}`}>
            {field.label}
          </div>
          <div className="text-xs text-gray-500 capitalize mt-0.5 flex items-center gap-1">
            {field.settings?.hidden && (
              <svg className="w-3 h-3 text-rf-warning flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            )}
            {field.type}
            {field.required && !field.settings?.hidden && (
              <span className="ml-1 text-rf-danger">*</span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

export default function FormBuilderSidebar({
  fields,
  selectedFieldId,
  onSelectField,
  onReorder,
}: FormBuilderSidebarProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    onReorder(arrayMove(fields, oldIndex, newIndex));
  };

  return (
    <div className="w-64 bg-rf-surface-card border-r border-gray-200 h-full overflow-y-auto flex flex-col">
      {/* Sidebar Header */}
      <div className="px-4 py-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
          Form Structure
        </h3>
      </div>

      {/* Form Structure */}
      <div className="flex-1 py-2">
        <div className="mt-1 mb-2 px-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Page 1
          </div>
        </div>

        <div className="space-y-0.5 px-2">
          {fields.length === 0 ? (
            <div className="px-2 py-3 text-sm text-gray-400 italic">
              No questions yet
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {fields.map((field, index) => (
                  <SortableFieldItem
                    key={field.id}
                    field={field}
                    index={index}
                    selectedFieldId={selectedFieldId}
                    onSelectField={onSelectField}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Sidebar Footer Info */}
      <div className="border-t border-gray-200 px-4 py-3">
        <div className="text-xs text-gray-500">
          <div className="flex items-center justify-between mb-1">
            <span>Total Questions:</span>
            <span className="font-semibold text-gray-900">{fields.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Required:</span>
            <span className="font-semibold text-gray-900">
              {fields.filter((f) => f.required).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
