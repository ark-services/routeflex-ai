/**
 * Database schema checking utilities
 * Used to safely handle missing columns without crashing
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Check if a column exists in a table
 * Uses information_schema to query column metadata
 */
export async function columnExists(
  supabase: SupabaseClient,
  tableName: string,
  columnName: string,
  schemaName: string = 'public'
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', schemaName)
      .eq('table_name', tableName)
      .eq('column_name', columnName)
      .maybeSingle();

    if (error) {
      console.warn(`[columnExists] Failed to check column ${tableName}.${columnName}:`, error.message);
      return false;
    }

    return !!data;
  } catch (err: any) {
    console.warn(`[columnExists] Exception checking column ${tableName}.${columnName}:`, err.message);
    return false;
  }
}

/**
 * Check if metadata column exists in integration_credentials table
 * Cached result to avoid repeated queries
 */
let metadataColumnExistsCache: boolean | null = null;

export async function integrationCredentialsHasMetadata(
  supabase: SupabaseClient
): Promise<boolean> {
  // Return cached result if available
  if (metadataColumnExistsCache !== null) {
    return metadataColumnExistsCache;
  }

  // Check if column exists
  const exists = await columnExists(supabase, 'integration_credentials', 'metadata');

  // Cache the result
  metadataColumnExistsCache = exists;

  return exists;
}

/**
 * Reset the cache (useful for testing or after migrations)
 */
export function resetSchemaCache(): void {
  metadataColumnExistsCache = null;
}
