"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function disconnectGmail(accountId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: membership } = await supabase
    .from('account_memberships')
    .select('role')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .single();

  if (!membership || membership.role !== 'admin') {
    throw new Error('Forbidden');
  }

  // Mark all Gmail connections for this account+user as revoked (new OAuth flow)
  const { error: revokeError } = await supabase
    .from('gmail_connections')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if (revokeError) {
    console.error('[disconnectGmail] Failed to revoke gmail_connections:', revokeError);
  }

  // Also mark old integration_credentials as inactive (backward compatibility)
  await supabase
    .from('integration_credentials')
    .update({ is_active: false })
    .eq('account_id', accountId)
    .eq('integration_type', 'gmail');

  revalidatePath(`/admin/${accountId}/integrations`);
}

export async function getGmailConnection(accountId: string): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('[getGmailConnection] No authenticated user');
    return null;
  }

  // First check new gmail_connections table (per-user OAuth)
  const { data: connection, error: connError } = await supabase
    .from('gmail_connections')
    .select('id, email_address')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .maybeSingle();

  if (connError) {
    console.error('[getGmailConnection] Failed to query gmail_connections:', connError.message);
  }

  if (connection) {
    return { id: connection.id, email: connection.email_address };
  }

  // Fallback: check old integration_credentials table (account-level OAuth)
  const { data: oldCred } = await supabase
    .from('integration_credentials')
    .select('id, metadata')
    .eq('account_id', accountId)
    .eq('integration_type', 'gmail')
    .eq('is_active', true)
    .maybeSingle();

  return oldCred ? { id: oldCred.id, email: oldCred.metadata?.email } : null;
}
