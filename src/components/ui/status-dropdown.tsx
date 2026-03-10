"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

interface StatusLabel {
  id: string;
  label: string;
  color: string;
}

interface StatusDropdownProps {
  value: string | null;
  labels: StatusLabel[];
  onChange: (labelId: string | null) => void;
  onEditLabels: () => void;
  disabled?: boolean;
}

/**
 * StatusDropdown component
 *
 * Clean, Monday.com-style status dropdown with pill-style options.
 * No emojis, no clutter - just professional status selection.
 */
export function StatusDropdown({
  value,
  labels,
  onChange,
  onEditLabels,
  disabled = false,
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);

  const selectedLabel = labels.find((l) => l.id === value);

  // Calculate portal position when dropdown opens — flip upward if not enough space below
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const MARGIN = 12;
      if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
        setMenuPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: Math.max(rect.width, 200),
          maxHeight: spaceBelow - MARGIN,
        });
      } else {
        setMenuPosition({
          bottom: window.innerHeight - rect.top,
          left: rect.left + window.scrollX,
          width: Math.max(rect.width, 200),
          maxHeight: spaceAbove - MARGIN,
        });
      }
    } else {
      setMenuPosition(null);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  return (
    <div className="w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="h-8 w-full rounded-lg border border-transparent px-3 text-sm font-medium transition-all hover:border-rf-border focus:border-rf-blue focus:outline-none disabled:opacity-50"
        style={{
          backgroundColor: selectedLabel ? `${selectedLabel.color}15` : 'transparent',
          color: selectedLabel ? selectedLabel.color : '#6B7280',
        }}
      >
        <div className="flex items-center gap-2">
          {selectedLabel && (
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: selectedLabel.color }}
            />
          )}
          <span className="flex-1 text-left truncate">
            {selectedLabel?.label || '—'}
          </span>
        </div>
      </button>

      {isOpen && menuPosition && typeof window !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[998]"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-[999] rounded-lg border border-rf-border bg-rf-surface-card py-1 shadow-rf-xl overflow-y-auto"
            style={{
              top: menuPosition.top != null ? `${menuPosition.top}px` : undefined,
              bottom: menuPosition.bottom != null ? `${menuPosition.bottom}px` : undefined,
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`,
              maxHeight: `${menuPosition.maxHeight}px`,
            }}
          >
            {/* Empty option */}
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-rf-text-secondary hover:bg-rf-surface-page transition-colors flex items-center gap-2"
            >
              <div className="h-2 w-2" />
              <span>—</span>
              {value === null && (
                <Check className="ml-auto h-4 w-4 text-rf-blue" strokeWidth={2.5} />
              )}
            </button>

            {/* Divider */}
            <div className="my-1 border-t border-rf-ink-100" />

            {/* Status options */}
            {labels.map((label) => (
              <button
                key={label.id}
                type="button"
                onClick={() => {
                  onChange(label.id);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-rf-surface-page flex items-center gap-2"
                style={{ color: label.color }}
              >
                <div
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span className="flex-1 truncate">{label.label}</span>
                {value === label.id && (
                  <Check className="h-4 w-4 flex-shrink-0" strokeWidth={2.5} />
                )}
              </button>
            ))}

            {/* Divider */}
            <div className="my-1 border-t border-rf-ink-100" />

            {/* Edit labels option */}
            <button
              type="button"
              onClick={() => {
                onEditLabels();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-rf-ink-500 hover:bg-rf-surface-page transition-colors"
            >
              Edit labels
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
