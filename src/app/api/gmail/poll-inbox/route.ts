/**
 * GET /api/gmail/poll-inbox
 *
 * Vercel Cron endpoint that polls Gmail for incoming emails matching
 * "Monitor Gmail" automation triggers (trigger_key = 'gmail.email_received').
 *
 * Scheduled every 5 minutes in vercel.json.
 *
 * Flow:
 *   1. Find all enabled automations using the gmail.email_received trigger.
 *   2. Group by company; for each company with an active Gmail connection:
 *      a. Build Gmail search query from trigger configs (sender, subject, after:).
 *      b. Fetch matching messages via Gmail API.
 *      c. For each message, evaluate each automation's filters.
 *      d. Resolve the applicant using the automation's matching strategy.
 *      e. Fire fireJobTrigger() for matched applicants.
 *      f. Insert dedup record to prevent re-processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getGmailClientForCompany } from "@/lib/gmail-send";
import { searchGmailMessages, getGmailMessage } from "@/lib/gmail-read";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";

export const maxDuration = 60;

// ── Types ────────────────────────────────────────────────────────────────────

interface GmailTriggerConfig {
  sender_contains?: string;
  subject_contains?: string;
  body_extract_pattern?: string;
  match_applicant_by: "sender_email" | "body_extract";
  match_column_id?: string; // board column UUID for body_extract matching
}

interface AutomationRow {
  id: string;
  company_id: string;
  job_id: string;
  trigger_config: GmailTriggerConfig;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── Auth: verify Vercel cron secret ────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  // ── 1. Find all enabled automations with gmail.email_received trigger ──────
  const { data: automations, error: fetchError } = await supabase
    .from("automations")
    .select("id, company_id, job_id, trigger_config, filter")
    .eq("trigger_key", "gmail.email_received")
    .eq("is_enabled", true);

  if (fetchError) {
    console.error("[gmail/poll-inbox] Failed to fetch automations:", fetchError);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (!automations || automations.length === 0) {
    return NextResponse.json({ companiesPolled: 0, messagesProcessed: 0 });
  }

  // ── 2. Group automations by company ────────────────────────────────────────
  const byCompany = new Map<string, AutomationRow[]>();
  for (const a of automations) {
    // The UI saves Gmail trigger config into the `filter` column (merged with
    // conditions). Fall back to `filter` (stripping conditions) when
    // `trigger_config` is empty — which is the case for automations saved
    // before migration 00100 added the dedicated column.
    const rawConfig = (a.trigger_config && Object.keys(a.trigger_config).length > 0)
      ? a.trigger_config
      : (() => { const { conditions: _c, ...rest } = (a.filter ?? {}); return rest; })();
    const config = rawConfig as GmailTriggerConfig | null;
    if (!config?.match_applicant_by) continue; // skip misconfigured

    const list = byCompany.get(a.company_id) || [];
    list.push({
      id: a.id,
      company_id: a.company_id,
      job_id: a.job_id,
      trigger_config: config,
    });
    byCompany.set(a.company_id, list);
  }

  console.log(`[gmail/poll-inbox] Found ${automations.length} automation(s) across ${byCompany.size} company(ies)`);

  let companiesPolled = 0;
  let messagesProcessed = 0;
  let triggersFireed = 0;
  let errors = 0;

  // ── 3. Process each company ────────────────────────────────────────────────
  for (const [companyId, companyAutomations] of byCompany) {
    try {
      const result = await processCompany(supabase, companyId, companyAutomations);
      companiesPolled++;
      messagesProcessed += result.messagesProcessed;
      triggersFireed += result.triggersFireed;
    } catch (err: unknown) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[gmail/poll-inbox] Error processing company ${companyId}:`, msg);
    }
  }

  console.log(`[gmail/poll-inbox] Done — companies: ${companiesPolled}, messages: ${messagesProcessed}, triggers: ${triggersFireed}, errors: ${errors}`);
  return NextResponse.json({ companiesPolled, messagesProcessed, triggersFireed, errors });
}

// ── processCompany ───────────────────────────────────────────────────────────

async function processCompany(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  automations: AutomationRow[],
): Promise<{ messagesProcessed: number; triggersFireed: number }> {
  // Get Gmail client for this company
  const gmailClient = await getGmailClientForCompany(supabase, companyId);
  if (!gmailClient) {
    console.log(`[gmail/poll-inbox] No active Gmail connection for company ${companyId} — skipping`);
    return { messagesProcessed: 0, triggersFireed: 0 };
  }

  // Build combined Gmail search query from all automations' filters
  // Use 10-minute lookback window (2× the 5-minute poll interval)
  const afterEpoch = Math.floor((Date.now() - 10 * 60 * 1000) / 1000);
  const query = buildCombinedQuery(automations, afterEpoch);

  console.log(`[gmail/poll-inbox] Company ${companyId}: searching Gmail with query: ${query}`);

  // Search Gmail
  let messageIds: string[];
  try {
    messageIds = await searchGmailMessages(gmailClient.gmail, query, 50);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("Insufficient Permission") || msg.includes("insufficientPermissions")) {
      console.warn(`[gmail/poll-inbox] Company ${companyId}: Gmail lacks read scope — user must reconnect`);
      return { messagesProcessed: 0, triggersFireed: 0 };
    }
    throw err;
  }

  if (messageIds.length === 0) {
    return { messagesProcessed: 0, triggersFireed: 0 };
  }

  console.log(`[gmail/poll-inbox] Company ${companyId}: found ${messageIds.length} message(s)`);

  let messagesProcessed = 0;
  let triggersFireed = 0;

  for (const messageId of messageIds) {
    // Fetch full message
    const message = await getGmailMessage(gmailClient.gmail, messageId);
    if (!message) {
      console.warn(`[gmail/poll-inbox] Could not parse message ${messageId} — skipping`);
      continue;
    }

    messagesProcessed++;

    // Evaluate each automation against this message
    for (const automation of automations) {
      const config = automation.trigger_config;

      // Check sender filter
      if (config.sender_contains) {
        if (!message.from.toLowerCase().includes(config.sender_contains.toLowerCase())) {
          continue; // sender doesn't match
        }
      }

      // Check subject filter
      if (config.subject_contains) {
        if (!message.subject.toLowerCase().includes(config.subject_contains.toLowerCase())) {
          continue; // subject doesn't match
        }
      }

      // Check dedup
      const { data: existing } = await supabase
        .from("gmail_processed_messages")
        .select("id")
        .eq("company_id", companyId)
        .eq("gmail_message_id", messageId)
        .eq("automation_id", automation.id)
        .maybeSingle();

      if (existing) continue; // already processed

      // Resolve applicant
      let applicantId: string | null = null;
      let jobId: string | null = automation.job_id;
      let extractedValue: string | null = null;

      if (config.match_applicant_by === "sender_email") {
        const match = await matchBySenderEmail(supabase, companyId, automation.job_id, message.from);
        if (match) {
          applicantId = match.applicantId;
          jobId = match.jobId;
        }
      } else if (config.match_applicant_by === "body_extract" && config.body_extract_pattern) {
        const pattern: string = config.body_extract_pattern;

        // Regex safety: reject patterns that are too long or contain nested quantifiers (ReDoS risk)
        if (pattern.length > 500) {
          console.warn(`[gmail/poll-inbox] Regex too long (${pattern.length} chars) in automation ${automation.id} — skipping`);
          continue;
        }
        if (/([+*])\s*\)[+*?]/.test(pattern)) {
          console.warn(`[gmail/poll-inbox] Unsafe regex (nested quantifiers) in automation ${automation.id} — skipping`);
          continue;
        }

        try {
          const regex = new RegExp(pattern, "i");
          const bodyMatch = message.bodyText.match(regex);
          if (bodyMatch && bodyMatch[1]) {
            // Strip any trailing HTML tags/entities that bleed in from HTML emails
            // e.g. "UA5JKOH2V4<br" → "UA5JKOH2V4"
            extractedValue = bodyMatch[1].replace(/<[^>]*$/, "").replace(/&\w+;$/, "").trim();

            if (config.match_column_id) {
              const match = await matchByColumnValue(supabase, companyId, config.match_column_id, extractedValue);
              if (match) {
                applicantId = match.applicantId;
                jobId = match.jobId;
              }
            }

            // Fallback: try matching via integration_submissions.external_reference
            if (!applicantId) {
              const match = await matchByExternalReference(supabase, companyId, extractedValue);
              if (match) {
                applicantId = match.applicantId;
                jobId = match.jobId;
              }
            }
          }
        } catch (regexErr) {
          console.warn(`[gmail/poll-inbox] Invalid regex in automation ${automation.id}:`, regexErr);
        }
      }

      // Insert dedup record regardless of match result
      await supabase.from("gmail_processed_messages").upsert(
        {
          company_id: companyId,
          gmail_message_id: messageId,
          automation_id: automation.id,
          applicant_id: applicantId,
          metadata: {
            from: message.from,
            subject: message.subject,
            extracted_value: extractedValue,
            matched: !!applicantId,
          },
        },
        { onConflict: "company_id,gmail_message_id,automation_id" }
      );

      if (!applicantId || !jobId) {
        console.log(`[gmail/poll-inbox] No applicant match for message ${messageId} (automation ${automation.id}) — from: ${message.from}, extracted: ${extractedValue}`);
        continue;
      }

      // Fire trigger
      console.log(`[gmail/poll-inbox] Firing trigger for applicant ${applicantId} (automation ${automation.id})`);

      await fireJobTrigger(supabase, {
        companyId,
        jobId,
        trigger_key: "gmail.email_received",
        subject_type: "applicant",
        subject_id: applicantId,
        payload: {
          applicant_id: applicantId,
          email_from: message.from,
          email_subject: message.subject,
          extracted_value: extractedValue,
          gmail_message_id: messageId,
        },
      });

      triggersFireed++;

      await logActivityEvent(supabase, {
        companyId,
        jobId,
        actorType: "system",
        eventType: "gmail.email_received",
        entityType: "applicant",
        entityId: applicantId,
        summary: `Gmail trigger matched: "${message.subject}" from ${message.from}`,
        data: {
          automation_id: automation.id,
          gmail_message_id: messageId,
          extracted_value: extractedValue,
        },
      });
    }
  }

  return { messagesProcessed, triggersFireed };
}

// ── Query builder ────────────────────────────────────────────────────────────

/**
 * Build a combined Gmail search query from all automation trigger configs.
 * Uses OR logic for multiple sender/subject filters so one API call covers
 * all automations for this company.
 */
function buildCombinedQuery(automations: AutomationRow[], afterEpoch: number): string {
  const parts: string[] = [];

  // Collect unique sender filters
  const senders = new Set<string>();
  const subjects = new Set<string>();

  for (const a of automations) {
    if (a.trigger_config.sender_contains) senders.add(a.trigger_config.sender_contains);
    if (a.trigger_config.subject_contains) subjects.add(a.trigger_config.subject_contains);
  }

  // Build query parts
  if (senders.size === 1) {
    parts.push(`from:${[...senders][0]}`);
  } else if (senders.size > 1) {
    // Gmail OR syntax: {from:a OR from:b}
    parts.push(`{${[...senders].map((s) => `from:${s}`).join(" OR ")}}`);
  }

  if (subjects.size === 1) {
    parts.push(`subject:"${[...subjects][0]}"`);
  } else if (subjects.size > 1) {
    parts.push(`{${[...subjects].map((s) => `subject:"${s}"`).join(" OR ")}}`);
  }

  parts.push(`after:${afterEpoch}`);

  return parts.join(" ");
}

// ── Applicant matching strategies ────────────────────────────────────────────

interface ApplicantMatch {
  applicantId: string;
  jobId: string;
}

/**
 * Match by sender email → applicants.email
 */
async function matchBySenderEmail(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  jobId: string,
  senderEmail: string,
): Promise<ApplicantMatch | null> {
  // First try within the specific job
  const { data: inJob } = await supabase
    .from("applicants")
    .select("id, job_id")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .ilike("email", senderEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inJob) return { applicantId: inJob.id, jobId: inJob.job_id };

  // Fallback: search across all jobs in the company
  const { data: anyJob } = await supabase
    .from("applicants")
    .select("id, job_id")
    .eq("company_id", companyId)
    .ilike("email", senderEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anyJob) return { applicantId: anyJob.id, jobId: anyJob.job_id };

  return null;
}

/**
 * Match by extracted value → board_cells.value_text for a specific column
 */
async function matchByColumnValue(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  columnId: string,
  value: string,
): Promise<ApplicantMatch | null> {
  const { data: cell } = await supabase
    .from("board_cells")
    .select("applicant_id")
    .eq("column_id", columnId)
    .eq("value_text", value)
    .limit(1)
    .maybeSingle();

  if (!cell) return null;

  // Get the applicant's job_id
  const { data: applicant } = await supabase
    .from("applicants")
    .select("id, job_id")
    .eq("id", cell.applicant_id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!applicant) return null;

  return { applicantId: applicant.id, jobId: applicant.job_id };
}

/**
 * Match by extracted value → integration_submissions.external_reference
 * This is the FADV Applicant ID matching path.
 */
async function matchByExternalReference(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  externalRef: string,
): Promise<ApplicantMatch | null> {
  const { data: submission } = await supabase
    .from("integration_submissions")
    .select("applicant_id, job_id")
    .eq("company_id", companyId)
    .eq("external_reference", externalRef)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!submission) return null;

  return { applicantId: submission.applicant_id, jobId: submission.job_id };
}
