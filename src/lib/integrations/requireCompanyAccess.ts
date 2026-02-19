import { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

export interface CompanyAccess {
  id: string;
  name: string;
  accountId: string;
}

/**
 * Verify that `companyId` exists and belongs to `accountId`.
 * Returns the company row on success; calls notFound() otherwise.
 *
 * Call this inside every company-scoped server component / action AFTER
 * requireAdmin(accountId) so the caller is already authenticated as admin.
 */
export async function requireCompanyAccess(
  supabase: SupabaseClient,
  accountId: string,
  companyId: string
): Promise<CompanyAccess> {
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, account_id")
    .eq("id", companyId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (!company) {
    notFound();
  }

  return {
    id: company.id,
    name: company.name,
    accountId: company.account_id,
  };
}
