"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateBoardGroupPortalSettings(
  companyId: string,
  groupId: string,
  data: { visible_to_applicants?: boolean; applicant_note?: string }
) {
  const supabase = await createClient();

  // Verify membership
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("board_groups")
    .update(data)
    .eq("id", groupId)
    .eq("company_id", companyId);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/${companyId}`);
  return { success: true };
}
