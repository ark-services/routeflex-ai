"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Returns the active invite link token for a given role, creating one if needed. */
export async function getOrCreateInviteLink(
  accountId: string,
  role: string = "member"
): Promise<{ token: string }> {
  await requireAdmin(accountId);
  const svc = getSvc();

  // Try to find an existing active link for this role
  const { data: existing } = await svc
    .from("account_invite_links")
    .select("token")
    .eq("account_id", accountId)
    .eq("role", role)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return { token: existing.token };

  // Create a fresh link
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: link, error } = await svc
    .from("account_invite_links")
    .insert({ account_id: accountId, role, created_by: user!.id })
    .select("token")
    .single();

  if (error) throw new Error(error.message);
  return { token: link.token };
}

/** Revokes all active links for a role and issues a fresh one. */
export async function regenerateInviteLink(
  accountId: string,
  role: string = "member"
): Promise<{ token: string }> {
  await requireAdmin(accountId);
  const svc = getSvc();

  // Revoke existing
  await svc
    .from("account_invite_links")
    .update({ is_active: false })
    .eq("account_id", accountId)
    .eq("role", role)
    .eq("is_active", true);

  // Create new
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: link, error } = await svc
    .from("account_invite_links")
    .insert({ account_id: accountId, role, created_by: user!.id })
    .select("token")
    .single();

  if (error) throw new Error(error.message);
  return { token: link.token };
}

/** Creates account_invite records and emails each address via Supabase auth. */
export async function sendEmailInvites(
  accountId: string,
  emails: string,
  role: string
): Promise<{ results: { email: string; success?: boolean; error?: string }[] }> {
  await requireAdmin(accountId);
  const svc = getSvc();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const emailList = emails
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://routeflex.ai");

  const results: { email: string; success?: boolean; error?: string }[] = [];

  for (const email of emailList) {
    // Upsert invite record (reset token if re-inviting)
    const { data: invite, error: insertError } = await svc
      .from("account_invites")
      .upsert(
        { account_id: accountId, email, role, invited_by: user!.id },
        { onConflict: "account_id,email" }
      )
      .select("token")
      .single();

    if (insertError) {
      results.push({ email, error: insertError.message });
      continue;
    }

    // Send via Supabase auth invite (works for new users; existing users get a magic link)
    const { error: authError } = await svc.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${baseUrl}/auth/callback?redirectTo=/invite/email/${invite.token}`,
    });

    if (authError && !authError.message.includes("already registered")) {
      results.push({ email, error: authError.message });
    } else {
      results.push({ email, success: true });
    }
  }

  revalidatePath(`/admin/${accountId}/users`);
  return { results };
}
