"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createCompany(formData: FormData) {
  console.log("[createCompany] Starting company creation...");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("[createCompany] User not authenticated");
    return { error: "Not authenticated" };
  }

  const name = formData.get("name") as string;
  const accountId = formData.get("accountId") as string;

  console.log("[createCompany] Creating company:", { name, accountId });

  if (!name || !accountId) {
    return { error: "Name and account ID are required" };
  }

  // Check if user is admin of the account
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .single();

  if (!membership || (membership.role !== "admin" && membership.role !== "owner")) {
    return { error: "Only admins can create companies" };
  }

  // Create slug from name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Create company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({
      name,
      slug,
      account_id: accountId,
    })
    .select()
    .single();

  if (companyError) {
    console.error("[createCompany] Error creating company:", companyError);
    return { error: "Failed to create company" };
  }

  console.log("[createCompany] Company created successfully:", company.id);

  // Revalidate dashboard paths to ensure the UI updates immediately
  revalidatePath("/", "layout"); // Revalidate layout to update company selector
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${company.id}`);
  console.log("[createCompany] Revalidated paths");

  return { companyId: company.id };
}

// Note: Job creation logic has been moved to /app/dashboard/[companyId]/jobs/actions.ts
// to use the new form engine. The createJob function here is deprecated.
