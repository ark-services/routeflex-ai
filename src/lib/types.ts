export interface Company {
  id: string;
  name: string;
  slug?: string;
  account_id?: string;
  created_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  created_at: string;
}

// Account types
export interface Account {
  id: string;
  name: string;
  plan_type: "basic" | "pro" | "enterprise";
  max_seats: number;
  billing_anchor_day: number;
  created_at: string;
}

export interface AccountMembership {
  id: string;
  account_id: string;
  user_id: string;
  role: "admin" | "member" | "viewer";
  created_at: string;
}

export const STAGES = [
  "Applied",
  "First Advantage",
  "Interviewing",
  "TSA",
  "HR Paperwork",
  "Hired",
  "Rejected",
] as const;

export type Stage = (typeof STAGES)[number];

export interface Candidate {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  stage: Stage;
  created_at: string;
}

export const JOB_STATUSES = ["open", "paused", "closed"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface Job {
  id: string;
  company_id: string;
  title: string;
  slug: string;
  location: string;
  terminal: string;
  status: JobStatus;
  created_at: string;
}

export const APPLICANT_STATUSES = ["applied", "reviewing", "interviewing", "offer", "hired", "rejected"] as const;

export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

export interface Applicant {
  id: string;
  company_id: string;
  job_id: string;
  full_name: string;
  email: string;
  phone: string;
  terminal_preference: string;
  experience: string;
  resume_url: string | null;
  status: ApplicantStatus;
  created_at: string;
}

// Monday-style board types

export interface BoardGroup {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export const COLUMN_TYPES = ["text", "number", "date", "file", "status"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export interface BoardColumn {
  id: string;
  board_id: string;
  company_id: string;
  name: string;
  type: ColumnType;
  settings: any; // jsonb
  sort_order: number;
  is_system: boolean;
  created_at: string;
}

export interface BoardStatusLabel {
  id: string;
  column_id: string;
  label: string;
  color: string;
  sort_order: number;
}

export interface BoardCell {
  id: string;
  applicant_id: string;
  column_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_status_label_id: string | null;
  created_at: string;
}
