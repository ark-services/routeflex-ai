"use server";

import { createClient } from "@/lib/supabase/server";

export interface NotificationItem {
  id: string;
  type: "error" | "alert" | "info";
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, unknown>;
}

export async function getNotifications(
  companyId: string
): Promise<{ items: NotificationItem[]; unreadCount: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("system_notifications")
    .select("id, type, title, body, created_at, read_at, metadata")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return { items: [], unreadCount: 0 };

  const items = data as NotificationItem[];
  const unreadCount = items.filter((n) => !n.read_at).length;

  return { items, unreadCount };
}

export async function markAllRead(companyId: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from("system_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .is("read_at", null);
}

export async function deleteAllNotifications(companyId: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from("system_notifications")
    .delete()
    .eq("company_id", companyId);
}

export async function markNotificationRead(id: string, companyId: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from("system_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .is("read_at", null);
}
