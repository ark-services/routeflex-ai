"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { addJob } from "@/app/dashboard/[companyId]/jobs/actions";

export async function completeOnboarding(data: {
  companyId: string;
  accountId: string;
  companyName: string;
  jobTitle: string;
  jobTemplate: "fedex_pd" | "scratch";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Verify the user owns this account
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", data.accountId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return { success: false, error: "Access denied" };
  }

  try {
    // Step 1: Rename the auto-created company
    const { error: renameError } = await supabase
      .from("companies")
      .update({ name: data.companyName.trim() })
      .eq("id", data.companyId);

    if (renameError) {
      console.error("[onboard] Failed to rename company:", renameError);
      return { success: false, error: "Failed to update company name" };
    }

    // Step 2: Create the first job (reuse addJob)
    const formData = new FormData();
    formData.set("companyId", data.companyId);
    formData.set("title", data.jobTitle.trim());
    formData.set("template", data.jobTemplate);
    formData.set("status", "open");

    const jobResult = await addJob(formData);

    if (!jobResult?.success) {
      return { success: false, error: "Failed to create job" };
    }

    // Step 3: Mark onboarding complete (use service client to bypass RLS)
    const serviceClient = createServiceClient();
    const { error: onboardError } = await serviceClient
      .from("accounts")
      .update({ onboarding_completed: true })
      .eq("id", data.accountId);

    if (onboardError) {
      console.error("[onboard] Failed to mark onboarding complete:", onboardError);
      // Non-fatal — the job was created successfully
    }

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/${data.companyId}`);

    return { success: true, redirectUrl: jobResult.redirectUrl };
  } catch (e: any) {
    console.error("[onboard] Error:", e);
    return { success: false, error: e.message || "Something went wrong" };
  }
}
