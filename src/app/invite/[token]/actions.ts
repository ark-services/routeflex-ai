"use server";

import { createClient } from "@/lib/supabase/server";

export async function acceptInviteLink(
  token: string
): Promise<
  | { accountId: string; alreadyMember?: boolean }
  | { error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite_link", {
    p_token: token,
  });

  if (error) return { error: error.message };
  if (data?.error) return { error: data.error as string };
  if (data?.already_member)
    return { accountId: data.account_id as string, alreadyMember: true };

  return { accountId: data.account_id as string };
}
