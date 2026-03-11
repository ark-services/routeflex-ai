"use server";

import { createServiceClient } from "@/lib/supabase/service";

export async function joinWaitlist(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  if (!email) {
    return { error: "Email is required" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: "Please enter a valid email address" };
  }

  const supabase = createServiceClient();

  const { error } = await supabase.from("waitlist_signups").insert({ email });

  if (error) {
    // Unique constraint violation = already signed up — show as success
    if (error.code === "23505") {
      return { success: true };
    }
    console.error("[Waitlist] Insert error:", error);
    return { error: "Something went wrong. Please try again." };
  }

  return { success: true };
}
