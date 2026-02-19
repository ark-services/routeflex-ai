"use server";

import { createClient } from "@/lib/supabase/server";

export interface ActivityEvent {
  id: string;
  company_id: string;
  job_id: string;
  actor_user_id: string | null;
  actor_type: 'user' | 'system' | 'automation';
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  data: Record<string, any>;
  created_at: string;
}

export async function getActivityEvents(
  companyId: string,
  jobId: string,
  options?: {
    limit?: number;
    cursor?: string;
    search?: string;
    eventTypeFilter?: string;
  }
): Promise<{ events: ActivityEvent[]; nextCursor: string | null }> {
  const supabase = await createClient();
  const limit = options?.limit ?? 50;

  let query = supabase
    .from("activity_events")
    .select("*")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  // Cursor-based pagination: cursor format is "created_at|id"
  if (options?.cursor) {
    const [cursorDate, cursorId] = options.cursor.split("|");
    if (cursorDate && cursorId) {
      // Fetch rows older than cursor
      query = query.or(
        `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`
      );
    }
  }

  // Search filter
  if (options?.search) {
    query = query.ilike("summary", `%${options.search}%`);
  }

  // Event type filter (e.g. 'automation' → event_type LIKE 'automation.%')
  if (options?.eventTypeFilter) {
    query = query.like("event_type", `${options.eventTypeFilter}.%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getActivityEvents] Failed to fetch:", error);
    return { events: [], nextCursor: null };
  }

  const rows = (data ?? []) as ActivityEvent[];
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && events.length > 0) {
    const last = events[events.length - 1];
    nextCursor = `${last.created_at}|${last.id}`;
  }

  return { events, nextCursor };
}
