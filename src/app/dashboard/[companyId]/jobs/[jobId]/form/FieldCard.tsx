"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  sort_order: number;
  settings: Record<string, any>;
};

type FieldCardProps = {
  field: FormField;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<FormField>) => Promise<void>;
  onDelete: () => void;
  onDuplicate?: () => void;
  onOpenSettings: () => void;
};

export default function FieldCard({
  field,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
  onOpenSettings,
}: FieldCardProps) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [description, setDescription] = useState(
    field.settings?.description || ""
  );

  const labelInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (isEditingLabel && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [isEditingLabel]);

  useEffect(() => {
    if (isEditingDescription && descriptionInputRef.current) {
      descriptionInputRef.current.focus();
      descriptionInputRef.current.select();
    }
  }, [isEditingDescription]);

  const handleLabelSave = async () => {
    if (label.trim() && label !== field.label) {
      await onUpdate({ label: label.trim() });
    } else {
      setLabel(field.label);
    }
    setIsEditingLabel(false);
  };

  const handleDescriptionSave = async () => {
    if (description !== (field.settings?.description || "")) {
      await onUpdate({
        settings: { ...field.settings, description },
      });
    }
    setIsEditingDescription(false);
  };

  const renderFieldPreview = () => {
    const placeholderText = field.settings?.placeholder || "";

    switch (field.type) {
      case "text":
        return (
          <input
            type="text"
            placeholder={placeholderText || "Type your answer here..."}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
            disabled
          />
        );
      case "textarea":
        return (
          <textarea
            placeholder={placeholderText || "Type your answer here..."}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 cursor-not-allowed resize-none"
            rows={3}
            disabled
          />
        );
      case "email":
        return (
          <input
            type="email"
            placeholder={placeholderText || "name@example.com"}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
            disabled
          />
        );
      case "phone":
        return (
          <input
            type="tel"
            placeholder={placeholderText || "+1 (555) 000-0000"}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
            disabled
          />
        );
      case "number":
        return (
          <input
            type="number"
            placeholder={placeholderText || "0"}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
            disabled
          />
        );
      case "date":
        return (
          <input
            type="date"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
            disabled
          />
        );
      case "file":
        return (
          <div className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center">
            <div className="text-gray-400 mb-2">
              <svg className="mx-auto h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">Drag and drop or click to upload</p>
          </div>
        );
      case "radio":
        const radioOptions = field.settings?.options || ["Option 1", "Option 2"];
        return (
          <div className="space-y-2">
            {radioOptions.map((option: string, idx: number) => (
              <label key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                <input type="radio" disabled className="cursor-not-allowed" />
                {option}
              </label>
            ))}
          </div>
        );
      case "checkbox":
        return (
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              disabled
              defaultChecked={field.settings?.defaultChecked ?? false}
              className="h-4 w-4 rounded border-gray-300 cursor-not-allowed"
            />
            <span className="text-sm text-gray-500">{field.label}</span>
          </div>
        );
      case "select":
        const selectOptions = field.settings?.options || ["Select an option", "Option 1", "Option 2"];
        return (
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
            disabled
          >
            {selectOptions.map((option: string, idx: number) => (
              <option key={idx}>{option}</option>
            ))}
          </select>
        );
      case "location":
        return (
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder={placeholderText || "123 Main St, City, State"}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
              disabled
            />
          </div>
        );
      default:
        return (
          <input
            type="text"
            placeholder="Answer..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
            disabled
          />
        );
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`
        relative rounded-xl border-2 bg-rf-surface-card p-6 transition-all cursor-pointer
        ${isSelected
          ? "border-rf-blue shadow-lg shadow-blue-100"
          : "border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md"
        }
      `}
    >
      {/* Hidden overlay banner */}
      {field.settings?.hidden && (
        <div className="absolute inset-0 rounded-xl bg-rf-surface-card/70 flex items-center justify-center pointer-events-none z-10">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rf-warning-bg border border-amber-300 rounded-full shadow-sm">
            <svg className="w-3.5 h-3.5 text-rf-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
            <span className="text-xs font-semibold text-rf-warning">Hidden from form</span>
          </div>
        </div>
      )}

      {/* Field Type and Required Indicators (top-right stack) */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
          {field.type}
        </span>
        {field.required && (
          <Badge className="bg-rf-danger-bg text-red-700 border border-red-200">
            Required
          </Badge>
        )}
      </div>

      {/* Field Label */}
      <div className="mb-2 pr-20">
        {isEditingLabel ? (
          <input
            ref={labelInputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleLabelSave();
              } else if (e.key === "Escape") {
                setLabel(field.label);
                setIsEditingLabel(false);
              }
            }}
            className="w-full text-lg font-semibold text-gray-900 border-b-2 border-rf-blue focus:outline-none px-1 -mx-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <h3
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingLabel(true);
            }}
            className="text-lg font-semibold text-gray-900 hover:text-rf-blue cursor-text px-1 -mx-1 rounded hover:bg-gray-50"
          >
            {field.label}
          </h3>
        )}
      </div>

      {/* Field Description */}
      <div className="mb-4">
        {isEditingDescription ? (
          <input
            ref={descriptionInputRef}
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleDescriptionSave();
              } else if (e.key === "Escape") {
                setDescription(field.settings?.description || "");
                setIsEditingDescription(false);
              }
            }}
            placeholder="Add a description (optional)"
            className="w-full text-sm text-gray-600 border-b border-rf-blue focus:outline-none px-1 -mx-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingDescription(true);
            }}
            className="text-sm text-gray-600 hover:text-gray-900 cursor-text px-1 -mx-1 rounded hover:bg-gray-50 min-h-[20px]"
          >
            {description || "Add a description (optional)"}
          </p>
        )}
      </div>

      {/* Question Image */}
      {field.settings?.imageUrl && (
        <div className="mb-4 rounded-lg overflow-hidden border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={field.settings.imageUrl}
            alt=""
            className="w-full object-contain max-h-48 bg-gray-50"
          />
        </div>
      )}

      {/* Field Preview */}
      <div className="mb-4">
        {renderFieldPreview()}
      </div>

      {/* Contextual Controls (shown when selected) */}
      {isSelected && (
        <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Question settings
          </button>

          {onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Duplicate
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-rf-danger hover:bg-rf-danger-bg rounded-lg transition-colors ml-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
