export interface Company {
  id: string;
  name: string;
  slug?: string;
  created_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
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
