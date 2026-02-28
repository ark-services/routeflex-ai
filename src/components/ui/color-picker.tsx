"use client";

import { useState, useRef, useEffect } from "react";
import { STATUS_COLOR_PALETTE } from "@/lib/brand-colors";
import { Check } from "lucide-react";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
  inline?: boolean; // For inline display in editor
  disabledColors?: string[]; // Colors that are already in use
  size?: 'sm' | 'md'; // 'sm' = h-6 w-6, 'md' = h-9 w-9 (default)
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
export function ColorPicker({ value, onChange, className = "", inline = false, disabledColors = [], size = 'md' }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Fixed-position coords for the popover — recalculated each time the popover opens
  // so it tracks the button correctly even after scroll or layout changes.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
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

  function handleButtonClick() {
    if (!isOpen && buttonRef.current) {
      // Compute position from the button's viewport rect so the popover renders
      // correctly even inside scroll containers with overflow:auto (which would
      // clip an absolutely-positioned child despite z-index).
      const rect = buttonRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    }
    setIsOpen((prev) => !prev);
  }

  // Shared color grid used in both inline and popover modes
  function ColorGrid({ onSelect }: { onSelect: (color: string) => void }) {
    return (
      <div className="grid grid-cols-6 gap-2">
        {STATUS_COLOR_PALETTE.map((color) => {
          const isDisabled = disabledColors.includes(color.value) && value !== color.value;
          return (
            <button
              key={color.value}
              type="button"
              onClick={() => !isDisabled && onSelect(color.value)}
              disabled={isDisabled}
              className={`relative h-9 w-9 rounded-lg border transition-colors focus:outline-none ${
                isDisabled
                  ? 'opacity-30 cursor-not-allowed border-rf-ink-300'
                  : 'border-rf-ink-100 hover:border-rf-ink-300'
              }`}
              style={{
                backgroundColor: color.value,
                boxShadow: value === color.value ? `0 0 0 2px var(--rf-blue)` : 'none',
              }}
              title={isDisabled ? `${color.name} (already in use)` : color.name}
            >
              {value === color.value && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Check className="h-4 w-4 text-white drop-shadow-md" strokeWidth={3} />
                </div>
              )}
              {isDisabled && value !== color.value && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-[2px] w-full bg-rf-ink-300 rotate-45" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Inline mode - just show the grid directly (no popover)
  if (inline) {
    return <ColorGrid onSelect={onChange} />;
  }

  // Popover mode — uses position:fixed so it escapes overflow:auto scroll containers.
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        className={`${size === 'sm' ? 'h-6 w-6 rounded-md' : 'h-9 w-9 rounded-lg'} border border-rf-ink-100 hover:border-rf-ink-300 transition-colors focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 flex-shrink-0`}
        style={{ backgroundColor: value }}
        aria-label="Choose color"
      />

      {isOpen && popoverPos && (
        <div
          ref={popoverRef}
          style={{ top: popoverPos.top, left: popoverPos.left }}
          className="fixed z-50 rounded-rf-md border border-rf-border bg-rf-surface-card p-3 shadow-rf-xl"
        >
          <ColorGrid
            onSelect={(color) => {
              onChange(color);
              setIsOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
