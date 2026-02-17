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

  await supabase
    .from('integration_credentials')
    .update({ is_active: false })
    .eq('account_id', accountId)
    .eq('integration_type', 'gmail');

  revalidatePath(`/admin/${accountId}/integrations`);
}

export async function getGmailConnection(accountId: string): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('integration_credentials')
    .select('id, metadata')
    .eq('account_id', accountId)
    .eq('integration_type', 'gmail')
    .eq('is_active', true)
    .maybeSingle();

  return data ? { id: data.id, email: data.metadata?.email } : null;
}
