"use client";

import { useEffect, useState, useTransition } from "react";
import { validateEmail } from "@/lib/validation/columnValidation";

export function EmailCell({
  value,
  onUpdate,
}: {
  value: string | null;
  onUpdate: (val: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [localValue, setLocalValue] = useState<string>(value ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync from server when not editing
  useEffect(() => {
    if (!isEditing) setLocalValue(value ?? "");
  }, [value, isEditing]);

  const commitEmailEdit = () => {
    const raw = localValue.trim();

    // Allow clearing the field
    if (!raw) {
      setIsEditing(false);
      setError(null);
      if (value) startTransition(() => onUpdate(null));
      return;
    }

    const { valid, error: errMsg } = validateEmail(raw);
    if (!valid) {
      setError(errMsg ?? "Invalid email address");
      // Keep focus so user can fix the value
      return;
    }

    setError(null);
    setIsEditing(false);
    if (raw !== value) {
      startTransition(() => onUpdate(raw));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEmailEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setLocalValue(value ?? "");
      setError(null);
      setIsEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="relative">
      <input
        type="email"
        value={localValue}
        onChange={(e) => { setLocalValue(e.target.value); setError(null); }}
        onFocus={() => { setIsEditing(true); setLocalValue(value ?? ""); }}
        onBlur={commitEmailEdit}
        onKeyDown={handleKeyDown}
        className={`h-8 w-full rounded border px-2 text-[16px] md:text-sm outline-none transition-colors hover:border-rf-border focus:border-rf-blue ${
          error ? "border-red-400 bg-rf-danger-bg focus:border-red-500" : "border-transparent"
        }`}
        placeholder="email@example.com"
        title={!isEditing && value ? value : undefined}
      />
      {error && (
        <div className="absolute left-0 top-full z-10 mt-0.5 rounded border border-red-200 bg-rf-danger-bg px-2 py-1 text-xs text-red-700 shadow-sm whitespace-nowrap pointer-events-none">
          {error}
        </div>
      )}
      {isPending && !error && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-rf-ink-100 border-t-blue-500" />
        </div>
      )}
    </div>
  );
}
