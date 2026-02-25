"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function uploadCompanyLogo(
  companyId: string,
  formData: FormData
): Promise<{ success: true; logoUrl: string } | { success: false; error: string }> {
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return { success: false, error: "No file provided" };

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: "Invalid file type. Use JPEG, PNG, GIF, WebP, or SVG." };
  }

  const MAX_SIZE = 200 * 1024; // 200KB — enough for any logo
  if (file.size > MAX_SIZE) {
    return { success: false, error: "File too large. Maximum 200KB." };
  }

  // Convert to base64 data URL for simple, permanent storage
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const logoUrl = `data:${file.type};base64,${base64}`;

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ logo_url: logoUrl })
    .eq("id", companyId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/${companyId}/settings`);
  return { success: true, logoUrl };
}

export async function removeCompanyLogo(companyId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("companies").update({ logo_url: null }).eq("id", companyId);
  revalidatePath(`/dashboard/${companyId}/settings`);
}

export async function updateCompanyName(
  companyId: string,
  name: string
): Promise<void> {
  if (!name.trim()) throw new Error("Name is required");
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ name: name.trim() })
    .eq("id", companyId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/settings`);
}
