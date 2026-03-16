export interface Company {
  id: string;
  name: string;
  slug?: string;
  account_id?: string;
  lms_enabled?: boolean;
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
  plan_type: "free" | "basic" | "pro" | "enterprise";
  max_seats: number;
  billing_anchor_day: number;
  created_at: string;
}

export interface SubscriptionPlan {
  id: "free" | "basic" | "pro" | "enterprise";
  name: string;
  price_cents: number;
  max_seats: number;            // -1 = unlimited
  max_companies: number;        // -1 = unlimited
  max_jobs_per_company: number; // -1 = unlimited
  actions_per_month: number;
  template_access: boolean;
  lms_access: boolean;
}

export interface AccountPlanLimits {
  plan_id: string;
  plan_name: string;
  price_cents: number;
  max_seats: number;
  max_companies: number;
  max_jobs_per_company: number;
  actions_per_month: number;
  template_access: boolean;
  lms_access: boolean;
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

export const COLUMN_TYPES = [
  "text", "number", "date", "file", "status", "checkbox", "email", "phone", "location",
  "fadv.package", "fadv.location", "fadv.facility_id", "fadv.position_type",
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

/** FADV-specific column types that sync to applicant_integration_fields */
export const FADV_COLUMN_TYPES = [
  "fadv.package", "fadv.location", "fadv.facility_id", "fadv.position_type",
] as const;
export type FadvColumnType = (typeof FADV_COLUMN_TYPES)[number];

/** Map from FADV column type → field key in applicant_integration_fields.fields */
export const FADV_COLUMN_TYPE_TO_FIELD: Record<FadvColumnType, string> = {
  "fadv.package":       "package",
  "fadv.location":      "location",
  "fadv.facility_id":   "facility_id",
  "fadv.position_type": "position_type",
};

export function isFadvColumnType(type: string): type is FadvColumnType {
  return (FADV_COLUMN_TYPES as readonly string[]).includes(type);
}

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
  value_bool: boolean | null;
  value_status_label_id: string | null;
  value_file_path: string | null;
  created_at: string;
}

// ─── Automation filter conditions ("and only if…") ───────────────────────────
//
// Stored inside automations.filter as { ...triggerConfig, conditions: [...] }.
// Each condition is AND-evaluated at runtime before executing actions.
// Template annotations (_column_name etc.) are added at capture time and used
// to remap UUIDs when the template is applied to a different board.

export type FilterConditionType =
  | "status_is"    | "status_is_not"
  | "text_contains" | "text_equals"
  | "number_eq"    | "number_gt"  | "number_gte" | "number_lt" | "number_lte"
  | "date_is"      | "date_before" | "date_after"
  | "item_in_group";

export interface FilterCondition {
  type: FilterConditionType | string; // string fallback for extensibility
  column_id?: string;                 // board column UUID (not needed for item_in_group)
  value: string | number;             // comparison value
  // Template annotation fields — added at capture, used at apply:
  _column_name?: string;
  _value_label?: string;       // label text for status_is / status_is_not
  _value_group_name?: string;  // group name for item_in_group
}

// ─── Template Center ────────────────────────────────────────────────────────

export interface TemplateRow {
  cells: Record<string, string>;
}

export interface TemplateGroup {
  name: string;
  color?: string;
  sort_order: number;
  settings?: Record<string, unknown>;
  rows?: TemplateRow[];
}

export interface TemplateColumn {
  name: string;
  type: string;
  sort_order: number;
  is_system: boolean;
  is_hidden?: boolean;
  settings: Record<string, unknown>;
}

export interface TemplateAutomationAction {
  type: string;
  sort_order: number;
  config: Record<string, unknown>;
}

export interface TemplateAutomation {
  type: string;       // trigger_key value
  name?: string;
  agent_name?: string; // name of the agent this automation belongs to (resolved on apply)
  config: Record<string, unknown>;   // filter jsonb
  trigger_config?: Record<string, unknown>; // trigger-specific config (e.g. Gmail matching rules)
  actions?: TemplateAutomationAction[];
}

export interface TemplateAgent {
  name: string;
  emoji: string;
  description: string;
  sort_order: number;
}

// ─── Template Form (Application Form captured into a template) ───────────────

export interface TemplateFormField {
  key: string;           // machine-readable key, e.g. "first_name"
  label: string;         // user-facing label
  type: string;          // text | textarea | email | phone | number | date | file | checkbox | radio | select
  required: boolean;
  sort_order: number;
  settings: Record<string, unknown>; // placeholder, options[], min/max, accept, maxSize, rows, etc.
}

export interface TemplateFormDesign {
  backgroundColor?: string; // hex color for form background
  logoPath?: string;         // storage path in "logos" bucket — copied to dest company on apply
                             // logoUrl is intentionally omitted: signed URLs are ephemeral
}

export interface TemplateForm {
  title: string;
  description: string | null;
  fields: TemplateFormField[];
  design: TemplateFormDesign;
}

export interface TemplateKnowledgeBaseEntry {
  question: string;
  answer: string;
  sort_order: number;
}

export interface TemplateBoardView {
  name: string;
  query: Record<string, unknown>;
  sort?: Record<string, unknown> | null;
  position: number;
  is_default: boolean;
}

export interface TemplatePayload {
  groups: TemplateGroup[];
  columns?: TemplateColumn[];
  agents?: TemplateAgent[];           // Automation agent groupings (optional — older templates won't have it)
  automations?: TemplateAutomation[];
  form?: TemplateForm;  // Application Form definition (optional — older templates won't have it)
  knowledgeBase?: TemplateKnowledgeBaseEntry[];  // Q&A entries for AI automations
  boardViews?: TemplateBoardView[];              // Saved search/filter views
}

export interface Template {
  id: string;
  title: string;
  description: string | null;
  thumbnail_path: string | null;
  payload: TemplatePayload;
  created_by: string | null;
  is_published: boolean;
  deleted_at: string | null;  // null = live; non-null = soft-deleted
  created_at: string;
  updated_at: string;
}

export interface JobTemplateApplication {
  id: string;
  job_id: string;
  template_id: string;
  applied_by: string;
  applied_at: string;
}
