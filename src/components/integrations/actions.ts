"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Fetch the active Gmail connection for a company.
 * Returns masked display data only — tokens are never surfaced.
 */
export async function getGmailConnection(
  companyId: string
): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn("[getGmailConnection] No authenticated user");
    return null;
  }

  // Company-scoped lookup (new path)
  const { data: connection, error: connError } = await supabase
    .from("gmail_connections")
    .select("id, email_address")
    .eq("company_id", companyId)
    .is("revoked_at", null)
    .maybeSingle();

  if (connError) {
    console.error(
      "[getGmailConnection] Failed to query gmail_connections:",
      connError.message
    );
  }

  if (connection) {
    return { id: connection.id, email: connection.email_address };
  }

  return null;
}

/**
 * Revoke all active Gmail connections for a company.
 * Caller must be an account admin.
 */
export async function disconnectGmail(
  companyId: string,
  accountId: string
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify admin
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    throw new Error("Forbidden");
  }

  // Revoke all active connections for this company
  const { error: revokeError } = await supabase
    .from("gmail_connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .is("revoked_at", null);

  if (revokeError) {
    console.error(
      "[disconnectGmail] Failed to revoke gmail_connections:",
      revokeError
    );
    throw new Error("Failed to disconnect Gmail");
  }

  revalidatePath(`/admin/${accountId}/companies/${companyId}/integrations`);
}
