// Shared types, constants, and helpers for automation components

export interface Trigger {
  id: string;
  key: string;
  name: string;
  description: string;
}

export interface Group {
  id: string;
  name: string;
  color: string;
}

export interface Column {
  id: string;
  name: string;
  type: string;
  labels?: Array<{
    id: string;
    label: string;
    color: string;
  }>;
}

export interface Action {
  type: string;
  config: Record<string, any>;
}

export interface FilterCondition {
  type: string;
  column_id?: string;
  value: string | number | "";
}

// Variables available for email customization in LMS / portal actions
export interface VariableItem { label: string; token: string }
export interface VariableGroup { section: string; items: VariableItem[] }

// Conditions available per column category — drives the new Column -> Condition -> Value UX
export const COLUMN_CONDITIONS: Record<string, Array<{ value: string; label: string }>> = {
  status: [
    { value: "status_is",     label: "is" },
    { value: "status_is_not", label: "is not" },
  ],
  text: [
    { value: "text_equals",   label: "equals" },
    { value: "text_contains", label: "contains" },
    { value: "is_not_empty",  label: "is not empty" },
    { value: "is_empty",      label: "is empty" },
  ],
  number: [
    { value: "number_eq",     label: "=" },
    { value: "number_gt",     label: ">" },
    { value: "number_gte",    label: "\u2265" },
    { value: "number_lt",     label: "<" },
    { value: "number_lte",    label: "\u2264" },
    { value: "is_not_empty",  label: "is not empty" },
    { value: "is_empty",      label: "is empty" },
  ],
  date: [
    { value: "date_is",       label: "is" },
    { value: "date_before",   label: "before" },
    { value: "date_after",    label: "after" },
    { value: "is_not_empty",  label: "is not empty" },
    { value: "is_empty",      label: "is empty" },
  ],
  file: [
    { value: "is_not_empty",  label: "is not empty" },
    { value: "is_empty",      label: "is empty" },
  ],
};

// Text-like column types that store their value in value_text
export const TEXT_COL_TYPES = ["text", "email", "phone", "location"];

// -- Body-extract pattern helpers --

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function unescapeRegex(str: string): string {
  return str.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");
}

// The middle section when a suffix is provided (phrase capture)
export const PHRASE_MID = "\\s*(.+?)\\s*";
// The tail when no suffix is provided (single-word capture)
export const WORD_TAIL = "\\s*(\\S+)";

/**
 * Parse a pattern built by buildSimplePattern() back into {prefix, suffix}.
 * Returns null if the pattern wasn't built by us (i.e. it's a custom regex).
 */
export function parseSimplePattern(pattern: string): { prefix: string; suffix?: string } | null {
  if (!pattern) return { prefix: "" };
  // Phrase match: prefix + \s*(.+?)\s* + suffix
  const midIdx = pattern.indexOf(PHRASE_MID);
  if (midIdx !== -1) {
    return {
      prefix: unescapeRegex(pattern.slice(0, midIdx)),
      suffix: unescapeRegex(pattern.slice(midIdx + PHRASE_MID.length)),
    };
  }
  // Single-word match: prefix + \s*(\S+)
  if (pattern.endsWith(WORD_TAIL)) {
    return { prefix: unescapeRegex(pattern.slice(0, -WORD_TAIL.length)) };
  }
  return null;
}

/**
 * Build a regex pattern from a prefix and optional suffix.
 * No suffix -> captures a single word (\S+).
 * With suffix -> captures everything between prefix and suffix (lazy .+?).
 */
export function buildSimplePattern(prefix: string, suffix?: string): string {
  if (!prefix) return "";
  const ep = escapeRegex(prefix);
  if (suffix && suffix.trim()) {
    return ep + PHRASE_MID + escapeRegex(suffix);
  }
  return ep + WORD_TAIL;
}

// Map a board column to its condition category
export function getColCategory(col?: Column): string | null {
  if (!col) return null;
  if (col.type === "status") return "status";
  if (TEXT_COL_TYPES.includes(col.type)) return "text";
  if (col.type === "number") return "number";
  if (col.type === "date") return "date";
  if (col.type === "file") return "file";
  return "text"; // fallback for unknown types
}

// Human-readable operator label for each condition type
export function conditionOpLabel(type: string): string {
  const map: Record<string, string> = {
    status_is: "is", status_is_not: "is not",
    text_equals: "equals", text_contains: "contains",
    number_eq: "=", number_gt: ">", number_gte: "\u2265", number_lt: "<", number_lte: "\u2264",
    date_is: "is", date_before: "before", date_after: "after",
    item_in_group: "in group",
    is_empty: "is empty", is_not_empty: "is not empty",
  };
  return map[type] ?? type;
}

/** Slugify a column name for use in template tokens: "FedEx ID" -> "fedex_id" */
export function slugifyColName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
