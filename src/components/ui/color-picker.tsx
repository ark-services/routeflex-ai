"use client";

import { useState, useRef, useEffect } from "react";
import { STATUS_COLOR_PALETTE } from "@/lib/brand-colors";
import { Check } from "lucide-react";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
  inline?: boolean; // For inline display in editor
}

/**
 * ColorPicker component
 *
 * Requirements:
 * - 6 colors per row
 * - 36x36 squares
 * - 8px border radius
 * - Subtle hover border
 * - Selected state = 2px ring in brand blue
 * - No emoji icons
 */
export function ColorPicker({ value, onChange, className = "", inline = false }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Inline mode - just show the grid directly
  if (inline) {
    return (
      <div className="grid grid-cols-6 gap-2">
        {STATUS_COLOR_PALETTE.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => onChange(color.value)}
            className="relative h-9 w-9 rounded-lg border border-stone-200 hover:border-stone-400 transition-colors focus:outline-none"
            style={{
              backgroundColor: color.value,
              boxShadow: value === color.value ? `0 0 0 2px #2563EB` : 'none',
            }}
            title={color.name}
          >
            {value === color.value && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Check className="h-4 w-4 text-white drop-shadow-md" strokeWidth={3} />
              </div>
            )}
          </button>
        ))}
      </div>
    );
  }

  // Popover mode - button that opens grid
  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 w-9 rounded-lg border border-stone-200 hover:border-stone-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        style={{ backgroundColor: value }}
        aria-label="Choose color"
      />

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-12 z-50 rounded-[10px] border border-stone-200 bg-white p-3 shadow-xl transition-all duration-150 opacity-100 scale-100"
        >
          <div className="grid grid-cols-6 gap-2">
            {STATUS_COLOR_PALETTE.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => {
                  onChange(color.value);
                  setIsOpen(false);
                }}
                className="relative h-9 w-9 rounded-lg border border-stone-200 hover:border-stone-400 transition-colors focus:outline-none"
                style={{
                  backgroundColor: color.value,
                  boxShadow: value === color.value ? `0 0 0 2px #2563EB` : 'none',
                }}
                title={color.name}
              >
                {value === color.value && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Check className="h-4 w-4 text-white drop-shadow-md" strokeWidth={3} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
