import { SupabaseClient } from "@supabase/supabase-js";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";

export interface CreateNotificationInput {
  companyId: string;
  jobId?: string | null;
  type: "error" | "alert" | "info";
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Insert a system notification and fire the `system.notification_created` trigger
 * so users can attach automation actions (email, Slack, webhook, etc.).
 */
export async function createNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput,
): Promise<string | null> {
  const { companyId, jobId, type, title, body, metadata } = input;

  const { data, error } = await supabase
    .from("system_notifications")
    .insert({
      company_id: companyId,
      job_id: jobId ?? null,
      type,
      title,
      body: body ?? null,
      metadata: metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createNotification] Failed to insert:", error.message);
    return null;
  }

  const notificationId = data.id as string;

  // Fire automation trigger if job_id is available (automations are job-scoped)
  if (jobId) {
    try {
      await fireJobTrigger(supabase, {
        companyId,
        jobId,
        trigger_key: "system.notification_created",
        subject_type: "notification",
        subject_id: notificationId,
        payload: {
          notification_id: notificationId,
          notification_type: type,
          type,
          title,
          body: body ?? "",
        },
      });
    } catch (err) {
      console.error("[createNotification] Failed to fire trigger:", err);
    }
  }

  return notificationId;
}
