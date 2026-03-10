"use client";

import { useState, useRef, useEffect, type ReactElement } from "react";

type FieldType = {
  value: string;
  label: string;
  description: string;
  icon: ReactElement;
};

const fieldTypes: FieldType[] = [
  {
    value: "text",
    label: "Short Text",
    description: "Single line text input",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  {
    value: "textarea",
    label: "Long Text",
    description: "Multi-line text area",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    value: "email",
    label: "Email",
    description: "Email address input",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    value: "phone",
    label: "Phone",
    description: "Phone number input",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    value: "number",
    label: "Number",
    description: "Numeric input",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
      </svg>
    ),
  },
  {
    value: "date",
    label: "Date",
    description: "Date picker",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    value: "file",
    label: "File Upload",
    description: "File upload (resume, documents)",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    value: "radio",
    label: "Radio Buttons",
    description: "Single choice from options",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="9" strokeWidth={2} />
        <circle cx="12" cy="12" r="4" fill="currentColor" />
      </svg>
    ),
  },
  {
    value: "checkbox",
    label: "Checkboxes",
    description: "Multiple choice from options",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: "select",
    label: "Dropdown",
    description: "Dropdown menu selection",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 10l-4 4-4-4" />
      </svg>
    ),
  },
  {
    value: "location",
    label: "Location",
    description: "Address or location input",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

type FieldTypePickerProps = {
  onSelect: (type: string) => void;
  onCancel: () => void;
};

export default function FieldTypePicker({ onSelect, onCancel }: FieldTypePickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onCancel();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onCancel]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  return (
    <div className="relative">
      <div
        ref={pickerRef}
        className="absolute top-0 left-0 right-0 bg-rf-surface-card rounded-xl shadow-xl border-2 border-rf-border z-10 max-h-[400px] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-rf-surface-card border-b border-rf-border px-4 py-3 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-rf-ink-900">Select Question Type</h3>
            <button
              onClick={onCancel}
              className="text-rf-text-muted hover:text-rf-text-secondary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Field Types Grid */}
        <div className="grid grid-cols-2 gap-2 p-3">
          {fieldTypes.map((fieldType) => (
            <button
              key={fieldType.value}
              onClick={() => onSelect(fieldType.value)}
              className="flex items-start gap-3 p-3 text-left rounded-lg border border-rf-border hover:border-rf-blue hover:bg-rf-blue-tint transition-all group"
            >
              <div className="flex-shrink-0 text-rf-text-secondary group-hover:text-rf-blue transition-colors mt-0.5">
                {fieldType.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-rf-ink-900 group-hover:text-rf-blue transition-colors">
                  {fieldType.label}
                </div>
                <div className="text-xs text-rf-text-muted mt-0.5 group-hover:text-rf-blue transition-colors">
                  {fieldType.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
