"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const redirectTo = (formData.get("redirectTo") as string | null) || "/";

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    const params = new URLSearchParams({ error: error.message });
    if (redirectTo !== "/") params.set("redirectTo", redirectTo);
    redirect(`/login?${params.toString()}`);
  }

  redirect(redirectTo);
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const redirectTo = (formData.get("redirectTo") as string | null) || "/";

  // Build the email confirmation redirect so it preserves the final destination
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const callbackUrl =
    redirectTo !== "/"
      ? `${appUrl}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`
      : `${appUrl}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    options: { emailRedirectTo: callbackUrl },
  });

  if (error) {
    const params = new URLSearchParams({ error: error.message });
    if (redirectTo !== "/") params.set("redirectTo", redirectTo);
    redirect(`/signup?${params.toString()}`);
  }

  // Email confirmation disabled (e.g. local dev) — session is immediately available
  if (data.session) {
    redirect(redirectTo);
  }

  // Email confirmation required — keep the redirectTo in the login URL so the
  // "Check your email" message still shows and the hidden field is ready if the
  // user refreshes and logs in directly after confirming
  const params = new URLSearchParams({
    error: "Check your email to confirm your account",
  });
  if (redirectTo !== "/") params.set("redirectTo", redirectTo);
  redirect(`/login?${params.toString()}`);
}

export async function logout() {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch {
    // Ignore sign-out errors (e.g. session already expired).
    // Always redirect to /login regardless.
  }
  redirect("/login");
}
