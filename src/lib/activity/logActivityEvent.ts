import { SupabaseClient } from '@supabase/supabase-js';

export interface ActivityEventInput {
  companyId: string;
  /** Null for company-level events (integrations, billing, etc.) */
  jobId?: string | null;
  actorUserId?: string | null;
  actorType: 'user' | 'system' | 'automation';
  eventType: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  data?: Record<string, any>;
}

export async function logActivityEvent(
  supabase: SupabaseClient,
  event: ActivityEventInput
): Promise<void> {
  const { error } = await supabase.from('activity_events').insert({
    company_id: event.companyId,
    job_id: event.jobId ?? null,
    actor_user_id: event.actorUserId ?? null,
    actor_type: event.actorType,
    event_type: event.eventType,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    summary: event.summary,
    data: event.data ?? {},
  });
  if (error) {
    // Non-fatal: log but don't throw
    console.error('[logActivityEvent] Failed to insert:', error);
  }
}
