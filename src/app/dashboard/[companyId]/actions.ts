"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertCompanyAccess } from "@/lib/rbac";
import type { Stage } from "@/lib/types";

export async function addCandidate(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  await assertCompanyAccess(companyId);
  const supabase = await createClient();

  const { error } = await supabase.from("candidates").insert({
    company_id: companyId,
    first_name: formData.get("firstName") as string,
    last_name: formData.get("lastName") as string,
    email: (formData.get("email") as string) || null,
    phone: (formData.get("phone") as string) || null,
  });

  if (error) {
    redirect(
      `/dashboard/${companyId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/dashboard/${companyId}`);
}

export async function updateCandidateStage(formData: FormData) {
  const companyId = formData.get("companyId") as string;
  await assertCompanyAccess(companyId);
  const candidateId = formData.get("candidateId") as string;
  const stage = formData.get("stage") as Stage;
  const supabase = await createClient();

  const { error } = await supabase
    .from("candidates")
    .update({ stage })
    .eq("id", candidateId)
    .eq("company_id", companyId);

  if (error) {
    redirect(
      `/dashboard/${companyId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/dashboard/${companyId}`);
}
