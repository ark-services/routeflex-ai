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

  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?error=Check+your+email+to+confirm+your+account");
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
