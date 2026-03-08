import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Helper: Resolve template variables in a string
 */
export function resolveVariables(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return context[key]?.toString() || match;
  });
}

/**
 * Helper: Convert a plain-text email body to HTML-safe format.
 * If the body already contains HTML tags it is returned as-is.
 * Otherwise newlines are converted to <br> tags so the email renders
 * correctly when sent with Content-Type: text/html.
 */
export function plainTextToHtml(body: string): string {
  if (/<[a-z][\s\S]*?>/i.test(body)) return body; // already HTML
  return body.replace(/\n/g, '<br>\n');
}

/**
 * Helper: Build a slug key from a column name matching the {{token}} convention.
 * e.g. "Vehicle Make and Model" → "vehicle_make_and_model"
 */
export function colNameToToken(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Helper: Fetch knowledge base Q&A entries for a job and format them as
 * a single string that can be injected into email / SMS / phone templates
 * via the {{knowledge_base}} variable.
 */
export async function fetchKnowledgeBaseContext(
  supabase: SupabaseClient,
  jobId: string
): Promise<string> {
  const { data: entries } = await supabase
    .from('job_knowledge_base')
    .select('question, answer')
    .eq('job_id', jobId)
    .order('sort_order', { ascending: true });

  if (!entries || entries.length === 0) return '';

  return entries
    .map((e, i) => `Q${i + 1}: ${e.question}\nA${i + 1}: ${e.answer}`)
    .join('\n\n');
}

/**
 * Realtime broadcast helper for ai.score_resume
 * Sends cell data to subscribed board clients via Supabase HTTP broadcast API.
 * This bypasses RLS (which blocks postgres_changes for complex JOIN policies).
 * Non-fatal: clients fall back to refresh if the fetch fails.
 */
export async function broadcastCell(jobId: string, cellData: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey':         serviceKey,
      },
      body: JSON.stringify({
        messages: [{
          topic:   `realtime:board-job-${jobId}`,
          event:   'cell-upserted',
          payload:  cellData,
        }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.error(`[broadcastCell] HTTP ${res.status} from Realtime API:`, body);
    } else {
      console.log(`[broadcastCell] OK — jobId=${jobId} col=${String(cellData.column_id)}`);
    }
  } catch (e) {
    console.error('[broadcastCell] non-fatal fetch error:', e);
  }
}
