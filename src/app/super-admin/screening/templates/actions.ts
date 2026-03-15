"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createTemplate() {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("screening_templates")
    .insert({ name: "New Template", is_active: false })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create template");
  revalidatePath("/super-admin/screening/templates");
  redirect(`/super-admin/screening/templates/${data.id}`);
}
