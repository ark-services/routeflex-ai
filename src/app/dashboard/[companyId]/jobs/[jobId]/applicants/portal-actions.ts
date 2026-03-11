"use server";

import { createClient } from "@/lib/supabase/server";
import { assertCompanyAccess } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

export async function updateBoardGroupPortalSettings(
  companyId: string,
  groupId: string,
  data: { visible_to_applicants?: boolean; applicant_note?: string }
) {
  await assertCompanyAccess(companyId);
  const supabase = await createClient();

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

export async function updateBoardGroupPipelineVisibility(
  companyId: string,
  groupId: string,
  showInPipeline: boolean
) {
  await assertCompanyAccess(companyId);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("board_groups")
    .update({ show_in_pipeline: showInPipeline })
    .eq("id", groupId)
    .eq("company_id", companyId);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/${companyId}`);
  return { success: true };
}

export type PortalChecklistItem = {
  id: string;              // client-generated UUID (stable list key)
  column_id: string;       // status (or any) column
  pass_label_id?: string | null;  // null = any non-empty value counts as complete
  date_column_id?: string | null; // optional: show a linked date column alongside the status
};

export async function updateBoardGroupPortalChecklist(
  companyId: string,
  groupId: string,
  checklist: PortalChecklistItem[]
) {
  await assertCompanyAccess(companyId);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Read current settings, merge portal_checklist key, write back
  const { data: group, error: fetchErr } = await supabase
    .from("board_groups")
    .select("settings")
    .eq("id", groupId)
    .eq("company_id", companyId)
    .single();

  if (fetchErr || !group) return { error: fetchErr?.message ?? "Group not found" };

  const newSettings = {
    ...(group.settings ?? {}),
    portal_checklist: checklist,
  };

  const { error } = await supabase
    .from("board_groups")
    .update({ settings: newSettings })
    .eq("id", groupId)
    .eq("company_id", companyId);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/${companyId}`);
  return { success: true };
}
