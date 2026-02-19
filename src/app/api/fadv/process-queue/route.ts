/**
 * GET /api/fadv/process-queue
 *
 * Vercel Cron endpoint that processes queued FADV submissions.
 * Scheduled every minute in vercel.json.
 *
 * Security:
 *   • In production Vercel sets `Authorization: Bearer <CRON_SECRET>` on every
 *     cron invocation. Set CRON_SECRET in your Vercel environment variables.
 *   • If CRON_SECRET is not set the endpoint is open (acceptable for local dev).
 *
 * Execution model:
 *   1. Query up to BATCH_SIZE queued integration_submissions rows.
 *   2. Atomically claim each by updating status 'queued' → 'running'.
 *      (If two workers race, the second update matches 0 rows and the row is
 *      skipped — no double-processing.)
 *   3. Load company FADV config, decrypt credentials, call FADV API stub.
 *   4. Update submission to 'success' | 'failed'.
 *   5. Write human-readable result back to output_column_id for the applicant.
 *   6. Log an activity_events row for audit.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { loadFadvConfig, runFadvApiCall } from "@/lib/fadv/submit";
import { decrypt } from "@/lib/encryption";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";

// Max submissions processed per cron invocation
const BATCH_SIZE = 5;

// ── Service-role client (bypasses RLS) ───────────────────────────────────────
function makeServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── Vercel max function duration ─────────────────────────────────────────────
// Set to 60 s on Pro plan. Adjust down to 10 s for Hobby.
export const maxDuration = 60;

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // ── Auth: verify Vercel cron secret ───────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = makeServiceClient();

  // ── 1. Fetch queued submissions ────────────────────────────────────────────
  const { data: submissions, error: fetchError } = await supabase
    .from("integration_submissions")
    .select("*")
    .eq("status", "queued")
    .eq("provider", "fadv")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    console.error("[fadv/process-queue] Failed to fetch queue:", fetchError);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (!submissions || submissions.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0, message: "Queue empty" });
  }

  console.log(`[fadv/process-queue] Found ${submissions.length} queued submission(s)`);

  let processed = 0;
  let failed = 0;

  for (const submission of submissions) {
    // ── 2. Atomically claim submission (queued → running) ──────────────────
    const { data: claimed, error: claimError } = await supabase
      .from("integration_submissions")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", submission.id)
      .eq("status", "queued")   // Only claims if still queued (race guard)
      .select()
      .maybeSingle();

    if (claimError || !claimed) {
      console.log(
        "[fadv/process-queue] Submission already claimed or missing:",
        submission.id
      );
      continue;
    }

    try {
      await processSubmission(supabase, claimed);
      processed++;
    } catch (err: any) {
      failed++;
      console.error("[fadv/process-queue] Unexpected error for submission:", submission.id, err);

      // Mark as failed — don't lose the record
      const now = new Date().toISOString();
      await supabase
        .from("integration_submissions")
        .update({
          status:        "failed",
          error_code:    "unexpected_error",
          error_message: err.message ?? "Unexpected error in queue processor",
          updated_at:    now,
          completed_at:  now,
        })
        .eq("id", submission.id);

      // Best-effort output column write
      if (claimed.output_column_id) {
        await writeOutputCell(
          supabase,
          claimed.applicant_id,
          claimed.output_column_id,
          "FADV failed ❌ unexpected_error"
        );
      }
    }
  }

  console.log(`[fadv/process-queue] Done — processed: ${processed}, failed: ${failed}`);
  return NextResponse.json({ processed, failed });
}

// ── processSubmission ─────────────────────────────────────────────────────────

async function processSubmission(supabase: ReturnType<typeof makeServiceClient>, submission: any) {
  const { id, company_id, applicant_id, job_id, input_snapshot, output_column_id } = submission;

  console.log("[fadv/process-queue] Processing submission:", {
    id,
    applicant_id,
    input_snapshot,
  });

  // ── 3. Load company FADV config ───────────────────────────────────────────
  const configResult = await loadFadvConfig(supabase, company_id);
  if (!configResult.ok) {
    await markFailed(
      supabase,
      id,
      applicant_id,
      job_id,
      company_id,
      output_column_id,
      "config_missing",
      configResult.reason,
      `FADV not submitted: ${configResult.reason}`
    );
    return;
  }

  // ── 4. Load applicant basic info ──────────────────────────────────────────
  const { data: applicant, error: appError } = await supabase
    .from("applicants")
    .select("full_name, email, phone")
    .eq("id", applicant_id)
    .maybeSingle();

  if (appError || !applicant) {
    await markFailed(
      supabase,
      id,
      applicant_id,
      job_id,
      company_id,
      output_column_id,
      "applicant_not_found",
      "Applicant not found",
      "FADV failed ❌ applicant_not_found"
    );
    return;
  }

  // ── 5. Decrypt credentials (server-side only) ─────────────────────────────
  let password: string | null = null;
  if (configResult.encryptedPassword) {
    try {
      password = decrypt(configResult.encryptedPassword);
    } catch {
      await markFailed(
        supabase,
        id,
        applicant_id,
        job_id,
        company_id,
        output_column_id,
        "decrypt_error",
        "Failed to decrypt FADV password",
        "FADV failed ❌ credential_error"
      );
      return;
    }
  }

  let securityAnswer: string | null = null;
  if (configResult.encryptedSecurityAnswer) {
    try {
      securityAnswer = decrypt(configResult.encryptedSecurityAnswer);
    } catch {
      await markFailed(
        supabase,
        id,
        applicant_id,
        job_id,
        company_id,
        output_column_id,
        "decrypt_error",
        "Failed to decrypt FADV security answer",
        "FADV failed ❌ credential_error"
      );
      return;
    }
  }

  // ── 6. Build applicant name parts ─────────────────────────────────────────
  const nameParts = (applicant.full_name ?? "").trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName  = nameParts.slice(1).join(" ") || (nameParts[0] ?? "");

  // ── 7. Call FADV API ──────────────────────────────────────────────────────
  console.log("[fadv/process-queue] Calling FADV API for applicant:", applicant_id);
  const fadvResult = await runFadvApiCall({
    cspId:          configResult.cspId,
    companyIdValue: configResult.companyIdValue,
    clientId:       configResult.clientId,
    firstName,
    lastName,
    email:          applicant.email  ?? "",
    phone:          applicant.phone  ?? "",
    packageCode:    input_snapshot.package       ?? "",
    facilityId:     input_snapshot.facility_id   ?? "",
    positionType:   input_snapshot.position_type ?? "",
    username:       configResult.username,
    password,
    securityAnswer,
  });

  const now = new Date().toISOString();
  const ts  = new Date().toLocaleString("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
    hour:  "numeric",
    minute:"2-digit",
  });

  // ── 8. Record outcome ─────────────────────────────────────────────────────
  if (fadvResult.success) {
    await supabase
      .from("integration_submissions")
      .update({
        status:             "success",
        external_reference: fadvResult.subjectId ?? null,
        updated_at:         now,
        completed_at:       now,
      })
      .eq("id", id);

    const msg =
      `FADV submitted ✅ (${ts})` +
      (fadvResult.subjectId ? ` ref=${fadvResult.subjectId}` : "");

    if (output_column_id) {
      await writeOutputCell(supabase, applicant_id, output_column_id, msg);
    }

    await logActivityEvent(supabase, {
      companyId:  company_id,
      jobId:      job_id ?? null,
      actorType:  "system",
      eventType:  "fadv.submission.success",
      entityType: "applicant",
      entityId:   applicant_id,
      summary:    `Applicant sent to First Advantage${fadvResult.subjectId ? ` (Subject ID: ${fadvResult.subjectId})` : ""}`,
      data: {
        applicant_id:   applicant_id,
        submission_id:  id,
        subject_id:     fadvResult.subjectId ?? null,
        package:        input_snapshot.package,
        facility_id:    input_snapshot.facility_id,
        position_type:  input_snapshot.position_type,
      },
    });

    console.log("[fadv/process-queue] ✓ Submission succeeded:", id, "subjectId:", fadvResult.subjectId);
  } else {
    const errorCode = (fadvResult.error ?? "unknown_error")
      .replace(/^FADV login failed:\s*/i, "")   // strip "FADV login failed: " prefix for brevity
      .slice(0, 80);

    await supabase
      .from("integration_submissions")
      .update({
        status:        "failed",
        error_code:    errorCode,
        error_message: fadvResult.error ?? "FADV submission failed",
        updated_at:    now,
        completed_at:  now,
      })
      .eq("id", id);

    const msg = `FADV failed ❌ ${errorCode}`;
    if (output_column_id) {
      await writeOutputCell(supabase, applicant_id, output_column_id, msg);
    }

    await logActivityEvent(supabase, {
      companyId:  company_id,
      jobId:      job_id ?? null,
      actorType:  "system",
      eventType:  "fadv.submission.failed",
      entityType: "applicant",
      entityId:   applicant_id,
      summary:    `FADV submission failed: ${fadvResult.error ?? "unknown"}`,
      data: {
        applicant_id:  applicant_id,
        submission_id: id,
        error:         fadvResult.error ?? null,
      },
    });

    console.error("[fadv/process-queue] ✗ Submission failed:", id, fadvResult.error);
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Marks a submission as failed and (optionally) writes to the output column.
 */
async function markFailed(
  supabase:         ReturnType<typeof makeServiceClient>,
  submissionId:     string,
  applicantId:      string,
  jobId:            string | null,
  companyId:        string,
  outputColumnId:   string | null,
  errorCode:        string,
  errorMessage:     string,
  outputMsg:        string
) {
  const now = new Date().toISOString();
  await supabase
    .from("integration_submissions")
    .update({
      status:        "failed",
      error_code:    errorCode,
      error_message: errorMessage,
      updated_at:    now,
      completed_at:  now,
    })
    .eq("id", submissionId);

  if (outputColumnId) {
    await writeOutputCell(supabase, applicantId, outputColumnId, outputMsg);
  }

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType:  "system",
    eventType:  "fadv.submission.failed",
    entityType: "applicant",
    entityId:   applicantId,
    summary:    `FADV submission failed: ${errorMessage}`,
    data: {
      applicant_id:  applicantId,
      submission_id: submissionId,
      error_code:    errorCode,
      error_message: errorMessage,
    },
  });
}

/**
 * Upserts a text value into a board_cells row for the given applicant + column.
 */
async function writeOutputCell(
  supabase:    ReturnType<typeof makeServiceClient>,
  applicantId: string,
  columnId:    string,
  value:       string
) {
  const { error } = await supabase
    .from("board_cells")
    .upsert(
      {
        applicant_id:          applicantId,
        column_id:             columnId,
        value_text:            value,
        value_number:          null,
        value_date:            null,
        value_status_label_id: null,
        value_file_path:       null,
      },
      { onConflict: "applicant_id,column_id" }
    );

  if (error) {
    console.error("[fadv/process-queue] writeOutputCell error (non-fatal):", error);
  }
}
