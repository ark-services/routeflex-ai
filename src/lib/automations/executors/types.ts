import { SupabaseClient } from '@supabase/supabase-js';

export interface ActionResult {
  success: boolean;
  error?: string;
}

export type ExecutorFn = (
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
) => Promise<ActionResult>;
