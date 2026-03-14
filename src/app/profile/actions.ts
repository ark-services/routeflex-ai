"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/* ------------------------------------------------------------------ */
/*  Display Name                                                       */
/* ------------------------------------------------------------------ */

export async function updateDisplayName(name: string) {
  const { supabase } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  if (trimmed.length > 100) throw new Error("Name is too long");

  const { error } = await supabase.auth.updateUser({
    data: { full_name: trimmed },
  });
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
}

/* ------------------------------------------------------------------ */
/*  Email                                                              */
/* ------------------------------------------------------------------ */

export async function updateEmail(newEmail: string) {
  const { supabase } = await requireUser();
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed) throw new Error("Email cannot be empty");

  const { error } = await supabase.auth.updateUser({ email: trimmed });
  if (error) throw new Error(error.message);

  // Supabase sends a confirmation email to the new address
  return { message: "Check your new email address for a confirmation link." };
}

/* ------------------------------------------------------------------ */
/*  Password                                                           */
/* ------------------------------------------------------------------ */

export async function updatePasswordFromProfile(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) {
  if (newPassword !== confirmPassword) {
    throw new Error("Passwords do not match");
  }
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const { supabase, user } = await requireUser();

  // Verify current password by attempting to sign in
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  });
  if (verifyError) {
    throw new Error("Current password is incorrect");
  }

  // Update to new password
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/*  Avatar                                                             */
/* ------------------------------------------------------------------ */

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

export async function uploadAvatar(formData: FormData) {
  const { supabase, user } = await requireUser();
  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) throw new Error("No file provided");

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Only JPEG, PNG, GIF, and WebP images are allowed");
  }
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("Image must be under 2MB");
  }

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const filePath = `${user.id}/avatar.${ext}`;

  // Delete any existing avatar files first
  const serviceSupabase = createServiceClient();
  const { data: existing } = await serviceSupabase.storage
    .from("avatars")
    .list(user.id);
  if (existing && existing.length > 0) {
    await serviceSupabase.storage
      .from("avatars")
      .remove(existing.map((f) => `${user.id}/${f.name}`));
  }

  // Upload new avatar
  const arrayBuf = await file.arrayBuffer();
  const { error: uploadError } = await serviceSupabase.storage
    .from("avatars")
    .upload(filePath, arrayBuf, {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  // Get public URL
  const {
    data: { publicUrl },
  } = serviceSupabase.storage.from("avatars").getPublicUrl(filePath);

  // Store URL in user metadata
  await supabase.auth.updateUser({
    data: { avatar_url: publicUrl },
  });

  revalidatePath("/profile");
  return { url: publicUrl };
}

export async function removeAvatar() {
  const { supabase, user } = await requireUser();

  const serviceSupabase = createServiceClient();
  const { data: existing } = await serviceSupabase.storage
    .from("avatars")
    .list(user.id);
  if (existing && existing.length > 0) {
    await serviceSupabase.storage
      .from("avatars")
      .remove(existing.map((f) => `${user.id}/${f.name}`));
  }

  await supabase.auth.updateUser({
    data: { avatar_url: null },
  });

  revalidatePath("/profile");
}

/* ------------------------------------------------------------------ */
/*  Notification Preferences                                           */
/* ------------------------------------------------------------------ */

export interface NotificationPreferences {
  email_system_notifications: boolean;
  email_automation_alerts: boolean;
  email_weekly_digest: boolean;
}

const DEFAULTS: NotificationPreferences = {
  email_system_notifications: true,
  email_automation_alerts: true,
  email_weekly_digest: false,
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("user_notification_preferences")
    .select("email_system_notifications, email_automation_alerts, email_weekly_digest")
    .eq("user_id", user.id)
    .single();

  return data ?? DEFAULTS;
}

export async function updateNotificationPreferences(prefs: NotificationPreferences) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert(
      {
        user_id: user.id,
        email_system_notifications: prefs.email_system_notifications,
        email_automation_alerts: prefs.email_automation_alerts,
        email_weekly_digest: prefs.email_weekly_digest,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
}

/* ------------------------------------------------------------------ */
/*  Account Deactivation                                               */
/* ------------------------------------------------------------------ */

export async function deactivateAccount() {
  const { supabase, user } = await requireUser();

  // Find the user's account
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("account_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) throw new Error("No account found");

  // Set deactivated_at using service role (RLS may block direct update)
  const serviceSupabase = createServiceClient();
  const { error } = await serviceSupabase
    .from("accounts")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", membership.account_id);

  if (error) throw new Error(error.message);

  // Sign out
  await supabase.auth.signOut();
  redirect("/login");
}

export async function reactivateAccount() {
  const { supabase, user } = await requireUser();

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("account_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) throw new Error("No account found");

  const serviceSupabase = createServiceClient();
  const { error } = await serviceSupabase
    .from("accounts")
    .update({ deactivated_at: null })
    .eq("id", membership.account_id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
