import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client using the service role key (bypasses RLS).
 * Use this for server-side operations that need full database access.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
