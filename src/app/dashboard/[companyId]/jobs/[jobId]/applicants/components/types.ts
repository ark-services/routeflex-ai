import type { BoardColumn as BaseBoardColumn, BoardStatusLabel } from "@/lib/types";
import type { PortalChecklistItem } from "../portal-actions";
import { statusColorArray } from "@/lib/brand-colors";

export type Group = {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  is_collapsed: boolean;
  settings?: { collapsed_columns?: string[]; hidden_columns?: string[]; portal_checklist?: PortalChecklistItem[] };
  visible_to_applicants?: boolean;
  applicant_note?: string | null;
  show_in_pipeline?: boolean;
};

export type ApplicantRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
  resume_path: string | null;
  jobs: { title: string } | null;
  group_id: string | null;
  position: number;
  portal_token?: string | null;
};

// Extend BoardColumn with job-specific UI fields
export type BoardColumn = BaseBoardColumn & {
  is_hidden?: boolean;
  settings?: {
    ui?: {
      collapsed?: boolean;
      width?: number;
    };
    [key: string]: any;
  };
};

// Alias for compatibility
export type StatusLabel = BoardStatusLabel;

export type StoredFile = {
  id: string;        // stable key -- uuid or path for legacy records
  name: string;      // original filename
  path: string;      // supabase storage path
  bucket: string;    // always "files"
  type: string;      // MIME type
  size: number;      // bytes
  createdAt: string; // ISO timestamp
};

export const PRESET_COLORS = statusColorArray.map(c => c.value);

export const COLUMN_MIN_WIDTH = 90;
export const COLUMN_MAX_WIDTH = 600;
export const STICKY_COL_WIDTH = 56;
export const ADD_COL_BTN_WIDTH = 56;

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  text: 180, number: 120, date: 140,
  file: 140, status: 160, email: 200,
  phone: 150, location: 200,
};

export function getDefaultWidth(type: string): number {
  return DEFAULT_COLUMN_WIDTHS[type] ?? 180;
}

export type CellColumnType = "text" | "number" | "date" | "status" | "checkbox" | "email" | "phone" | "location" | "file" | "fadv.package" | "fadv.location" | "fadv.facility_id" | "fadv.position_type";
