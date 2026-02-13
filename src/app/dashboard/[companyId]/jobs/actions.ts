"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "@/lib/types";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function addJob(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const title = (formData.get("title") as string).trim();
  const location = (formData.get("location") as string).trim();
  const terminal = (formData.get("terminal") as string).trim();
  const status = (formData.get("status") as JobStatus) || "open";
  const supabase = await createClient();

  const slug = slugify(title);

  const { error } = await supabase.from("jobs").insert({
    company_id: companyId,
    title,
    slug,
    location,
    terminal,
    status,
  });

  if (error) {
    redirect(
      `/dashboard/${companyId}/jobs?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/dashboard/${companyId}/jobs`);
}
