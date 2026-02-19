"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fireTrigger } from "@/lib/automations/fire";
import { AutomationActionType } from "@/lib/automations/actionTypes";

function dashPath(companyId: string) {
  return `/dashboard/${companyId}/automations`;
}

export async function listAutomations(companyId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("automations")
    .select(`
      id,
      name,
      is_enabled,
      trigger_key,
      filter,
      created_at,
      updated_at,
      automation_actions (
        id,
        type,
        config,
        sort_order
      )
    `)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return data || [];
}

export async function createAutomation(
  companyId: string,
  input: {
    name: string;
    trigger_key: string;
    filter?: Record<string, any>;
    actions: Array<{
      type: AutomationActionType;
      config: Record<string, any>;
    }>;
  }
) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Create automation
  const { data: automation, error: automationError } = await supabase
    .from("automations")
    .insert({
      company_id: companyId,
      name: input.name,
      trigger_key: input.trigger_key,
      filter: input.filter || {},
      created_by: user.id,
    })
    .select()
    .single();

  if (automationError || !automation) {
    throw new Error(automationError?.message || "Failed to create automation");
  }

  // Create actions
  if (input.actions && input.actions.length > 0) {
    const actionsToInsert = input.actions.map((action, index) => ({
      automation_id: automation.id,
      company_id: companyId,
      type: action.type,
      config: action.config,
      sort_order: index,
    }));

    const { error: actionsError } = await supabase
      .from("automation_actions")
      .insert(actionsToInsert);

    if (actionsError) {
      // Rollback automation if actions fail
      await supabase.from("automations").delete().eq("id", automation.id);
      throw new Error(actionsError.message);
    }
  }

  revalidatePath(dashPath(companyId));
  return automation;
}

export async function toggleAutomation(
  companyId: string,
  automationId: string,
  is_enabled: boolean
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("automations")
    .update({ is_enabled })
    .eq("id", automationId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

export async function deleteAutomation(companyId: string, automationId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("automations")
    .delete()
    .eq("id", automationId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId));
}

/**
 * Test-fire an automation trigger.
 * Useful for testing automations without waiting for real events.
 */
export async function testFireAutomation(
  companyId: string,
  input: {
    trigger_key: string;
    subject_type: string;
    subject_id: string;
    payload: Record<string, any>;
  }
) {
  const supabase = await createClient();

  await fireTrigger(supabase, {
    companyId,
    trigger_key: input.trigger_key,
    subject_type: input.subject_type,
    subject_id: input.subject_id,
    payload: {
      ...input.payload,
      company_id: companyId,
    },
  });

  revalidatePath(dashPath(companyId));
  return { success: true };
}

/**
 * Get automation run history
 */
export async function getAutomationRuns(
  companyId: string,
  automationId?: string,
  limit = 50
) {
  const supabase = await createClient();

  let query = supabase
    .from("automation_runs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (automationId) {
    query = query.eq("automation_id", automationId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return data || [];
}
