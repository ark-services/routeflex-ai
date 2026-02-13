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
