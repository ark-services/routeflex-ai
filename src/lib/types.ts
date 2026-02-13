export interface Company {
  id: string;
  name: string;
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
