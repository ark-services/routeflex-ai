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
import { createServiceClient } from "@/lib/supabase/service";
import { loadFadvConfig, runFadvApiCall } from "@/lib/fadv/submit";
import { runFadvApproveOrder } from "@/lib/fadv/approve";
import { decrypt } from "@/lib/encryption";
import { logActivityEvent } from "@/lib/activity/logActivityEvent";
import { loadSafetyTrainerConfig } from "@/components/integrations/safety-trainer-actions";
import { runSafetyTrainerSubmission } from "@/lib/safety-trainer/submit";

// Max submissions processed per cron invocation
const BATCH_SIZE = 5;

// ── Vercel max function duration ─────────────────────────────────────────────
// Browser automation (FADV login + form fill) takes 90–150 s.
// Raise to 300 s (5 min) — maximum allowed on Vercel Pro.
export const maxDuration = 300;

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

  const supabase = createServiceClient();

  // ── 0. Recover stuck "running" submissions ─────────────────────────────────
  // If a previous worker was killed mid-flight (e.g. Vercel timeout), the row
  // stays in 'running' forever and never gets retried.  Reset any submission
  // that has been running for more than 10 minutes back to 'queued'.
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stuckRows } = await supabase
    .from("integration_submissions")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("status", "running")
    .in("provider", ["fadv", "fadv_approve", "safety_trainer"])
    .lt("updated_at", stuckCutoff)
    .select("id");
  if (stuckRows && stuckRows.length > 0) {
    console.log(`[fadv/process-queue] Reset ${stuckRows.length} stuck-running submission(s) to queued`);
  }

  // ── 1. Fetch queued submissions (all providers) ────────────────────────────
  const { data: submissions, error: fetchError } = await supabase
    .from("integration_submissions")
    .select("*")
    .eq("status", "queued")
    .in("provider", ["fadv", "fadv_approve", "safety_trainer"])
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
      if (claimed.provider === "safety_trainer") {
        await processSafetyTrainerSubmission(supabase, claimed);
      } else if (claimed.provider === "fadv_approve") {
        await processFadvApproveSubmission(supabase, claimed);
      } else {
        await processFadvSubmission(supabase, claimed);
      }
      processed++;
    } catch (err: any) {
      failed++;
      const provider = claimed.provider ?? "fadv";
      console.error(`[${provider}/process-queue] Unexpected error for submission:`, submission.id, err);

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
        const label = provider === "safety_trainer" ? "Safety Trainer" : provider === "fadv_approve" ? "FADV Approve" : "FADV";
        await writeOutputCell(
          supabase,
          claimed.applicant_id,
          claimed.output_column_id,
          `${label} failed ❌ unexpected_error`
        );
      }
    }
  }

  console.log(`[fadv/process-queue] Done — processed: ${processed}, failed: ${failed}`);
  return NextResponse.json({ processed, failed });
}

// ── processFadvSubmission ─────────────────────────────────────────────────────

async function processFadvSubmission(supabase: ReturnType<typeof createServiceClient>, submission: any) {
  const { id, company_id, applicant_id, job_id, input_snapshot, output_column_id, subject_id_column_id } = submission;

  console.log("[fadv/process-queue] Processing submission:", {
    id,
    applicant_id,
    input_snapshot,
  });

  // ── 3. Load company FADV config ───────────────────────────────────────────
  console.log("[fadv/process-queue] Loading FADV config for company:", company_id);
  const configResult = await loadFadvConfig(supabase, company_id);
  if (!configResult.ok) {
    console.error("[fadv/process-queue] Config failed:", configResult.reason);
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
  console.log("[fadv/process-queue] Config OK:", {
    cspId: configResult.cspId,
    companyIdValue: configResult.companyIdValue,
    hasClientId: !!configResult.clientId,
    hasUsername: !!configResult.username,
    hasPassword: !!configResult.encryptedPassword,
    hasSecurityAnswer: !!configResult.encryptedSecurityAnswer,
  });

  // ── 4. Load applicant basic info ──────────────────────────────────────────
  console.log("[fadv/process-queue] Loading applicant:", applicant_id);
  const { data: applicant, error: appError } = await supabase
    .from("applicants")
    .select("full_name, email, phone")
    .eq("id", applicant_id)
    .maybeSingle();

  if (appError || !applicant) {
    console.error("[fadv/process-queue] Applicant not found:", applicant_id, appError);
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
  console.log("[fadv/process-queue] Applicant loaded:", {
    full_name: applicant.full_name,
    hasEmail: !!applicant.email,
    hasPhone: !!applicant.phone,
  });

  // ── 5. Decrypt credentials (server-side only) ─────────────────────────────
  console.log("[fadv/process-queue] Decrypting credentials...");
  let password: string | null = null;
  if (configResult.encryptedPassword) {
    try {
      password = decrypt(configResult.encryptedPassword);
      console.log("[fadv/process-queue] Password decrypted OK");
    } catch (err) {
      console.error("[fadv/process-queue] Failed to decrypt password:", err);
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
  } else {
    console.warn("[fadv/process-queue] No encrypted password in config");
  }

  let securityAnswer: string | null = null;
  if (configResult.encryptedSecurityAnswer) {
    try {
      securityAnswer = decrypt(configResult.encryptedSecurityAnswer);
      console.log("[fadv/process-queue] Security answer decrypted OK");
    } catch (err) {
      console.error("[fadv/process-queue] Failed to decrypt security answer:", err);
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
  } else {
    console.warn("[fadv/process-queue] No encrypted security answer in config");
  }

  // ── 6. Build applicant name / email — prefer column-mapped snapshot values ──
  const nameParts = (applicant.full_name ?? "").trim().split(/\s+/);
  const firstName = input_snapshot.first_name?.trim() || (nameParts[0] ?? "");
  const lastName  = input_snapshot.last_name?.trim()  || (nameParts.slice(1).join(" ") || (nameParts[0] ?? ""));
  const email     = input_snapshot.email?.trim()       || (applicant.email ?? "");
  const phone     = applicant.phone ?? "";

  // ── 7. Call FADV API ──────────────────────────────────────────────────────
  console.log("[fadv/process-queue] Launching browser for applicant:", applicant_id, {
    firstName,
    lastName,
    hasEmail: !!email,
    package: input_snapshot.package,
    facilityId: input_snapshot.facility_id,
    positionType: input_snapshot.position_type,
  });
  const fadvResult = await runFadvApiCall({
    cspId:          configResult.cspId,
    companyIdValue: configResult.companyIdValue,
    clientId:       configResult.clientId,
    firstName,
    lastName,
    email,
    phone,
    packageCode:    input_snapshot.package       ?? "",
    facilityId:     input_snapshot.facility_id   ?? "",
    positionType:   input_snapshot.position_type ?? "",
    username:       configResult.username,
    password,
    securityAnswer,
    companyId:      company_id,
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
  console.log("[fadv/process-queue] FADV API result:", {
    success: fadvResult.success,
    subjectId: fadvResult.success ? fadvResult.subjectId : undefined,
    error: !fadvResult.success ? fadvResult.error : undefined,
  });
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

    // Write the FADV Applicant ID to its dedicated column (if configured)
    if (subject_id_column_id && fadvResult.subjectId) {
      await writeOutputCell(supabase, applicant_id, subject_id_column_id, fadvResult.subjectId);
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

// ── processSafetyTrainerSubmission ────────────────────────────────────────────

async function processSafetyTrainerSubmission(
  supabase: ReturnType<typeof createServiceClient>,
  submission: any
) {
  const { id, company_id, applicant_id, job_id, input_snapshot, output_column_id } = submission;

  console.log("[safety_trainer/process-queue] Processing submission:", {
    id,
    applicant_id,
    input_snapshot,
  });

  // ── Load Safety Trainer config (includes signature_data_url) ──────────────
  const configResult = await loadSafetyTrainerConfig(supabase, company_id);
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
      `Safety Trainer not submitted: ${configResult.reason}`,
      "safety_trainer"
    );
    return;
  }

  // ── Load applicant basic info ──────────────────────────────────────────────
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
      "Safety Trainer failed ❌ applicant_not_found",
      "safety_trainer"
    );
    return;
  }

  // ── Run Playwright automation ──────────────────────────────────────────────
  console.log("[safety_trainer/process-queue] Running Playwright submission for:", applicant_id);

  const stResult = await runSafetyTrainerSubmission({
    config: configResult.config,
    applicant: {
      full_name: applicant.full_name ?? "",
      email:     applicant.email ?? "",
      phone:     applicant.phone ?? "",
    },
    driverFedexId:  input_snapshot.driver_fedex_id  ?? "",
    startDate:      input_snapshot.start_date        ?? "",
    completionDate: input_snapshot.completion_date   ?? "",
    contractNumber: input_snapshot.contract_number   ?? "",
  });

  const now = new Date().toISOString();
  const ts  = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });

  if (stResult.success) {
    await supabase
      .from("integration_submissions")
      .update({
        status:       "success",
        updated_at:   now,
        completed_at: now,
      })
      .eq("id", id);

    const msg = `Safety Trainer ✅ (${ts})`;
    if (output_column_id) {
      await writeOutputCell(supabase, applicant_id, output_column_id, msg);
    }

    await logActivityEvent(supabase, {
      companyId:  company_id,
      jobId:      job_id ?? null,
      actorType:  "system",
      eventType:  "safety_trainer.submission.success",
      entityType: "applicant",
      entityId:   applicant_id,
      summary:    "Applicant Safety Trainer certification form submitted",
      data: {
        applicant_id:  applicant_id,
        submission_id: id,
      },
    });

    console.log("[safety_trainer/process-queue] ✓ Submission succeeded:", id);
  } else {
    const errorCode = (stResult.error ?? "unknown_error").slice(0, 80);

    await supabase
      .from("integration_submissions")
      .update({
        status:        "failed",
        error_code:    errorCode,
        error_message: stResult.error ?? "Safety Trainer submission failed",
        updated_at:    now,
        completed_at:  now,
      })
      .eq("id", id);

    const msg = `Safety Trainer failed ❌ ${errorCode}`;
    if (output_column_id) {
      await writeOutputCell(supabase, applicant_id, output_column_id, msg);
    }

    await logActivityEvent(supabase, {
      companyId:  company_id,
      jobId:      job_id ?? null,
      actorType:  "system",
      eventType:  "safety_trainer.submission.failed",
      entityType: "applicant",
      entityId:   applicant_id,
      summary:    `Safety Trainer submission failed: ${stResult.error ?? "unknown"}`,
      data: {
        applicant_id:  applicant_id,
        submission_id: id,
        error:         stResult.error ?? null,
      },
    });

    console.error("[safety_trainer/process-queue] ✗ Submission failed:", id, stResult.error);
  }
}

// ── processFadvApproveSubmission ──────────────────────────────────────────────

async function processFadvApproveSubmission(
  supabase: ReturnType<typeof createServiceClient>,
  submission: any
) {
  const { id, company_id, applicant_id, job_id, input_snapshot, output_column_id } = submission;
  // Status column + label IDs stored in input_snapshot (no extra DB column needed)
  const status_column_id:  string | undefined = input_snapshot?.status_column_id;
  const approved_label_id: string | undefined = input_snapshot?.approved_label_id;
  const error_label_id:    string | undefined = input_snapshot?.error_label_id;

  console.log("[fadv_approve/process-queue] Processing submission:", {
    id,
    applicant_id,
    profile_id: input_snapshot?.profile_id,
  });

  // ── Load company FADV config ──────────────────────────────────────────────
  const configResult = await loadFadvConfig(supabase, company_id);
  if (!configResult.ok) {
    await markFailed(
      supabase, id, applicant_id, job_id, company_id, output_column_id,
      "config_missing", configResult.reason,
      `FADV Approve failed: ${configResult.reason}`,
      "fadv_approve"
    );
    if (status_column_id && error_label_id) await writeStatusLabelCell(supabase, applicant_id, status_column_id, error_label_id);
    return;
  }

  // ── Decrypt credentials ───────────────────────────────────────────────────
  let password: string | null = null;
  if (configResult.encryptedPassword) {
    try {
      password = decrypt(configResult.encryptedPassword);
    } catch {
      await markFailed(
        supabase, id, applicant_id, job_id, company_id, output_column_id,
        "decrypt_error", "Failed to decrypt FADV password",
        "FADV Approve failed ❌ credential_error",
        "fadv_approve"
      );
      if (status_column_id && error_label_id) await writeStatusLabelCell(supabase, applicant_id, status_column_id, error_label_id);
      return;
    }
  }

  let securityAnswer: string | null = null;
  if (configResult.encryptedSecurityAnswer) {
    try {
      securityAnswer = decrypt(configResult.encryptedSecurityAnswer);
    } catch {
      await markFailed(
        supabase, id, applicant_id, job_id, company_id, output_column_id,
        "decrypt_error", "Failed to decrypt FADV security answer",
        "FADV Approve failed ❌ credential_error",
        "fadv_approve"
      );
      if (status_column_id && error_label_id) await writeStatusLabelCell(supabase, applicant_id, status_column_id, error_label_id);
      return;
    }
  }

  // ── Run browser automation ────────────────────────────────────────────────
  const profileId = input_snapshot?.profile_id ?? "";
  console.log("[fadv_approve/process-queue] Running approve automation for profile:", profileId);

  const result = await runFadvApproveOrder({
    clientId:       configResult.clientId,
    username:       configResult.username,
    password,
    securityAnswer,
    profileId,
    companyId:      company_id,
  });

  const now = new Date().toISOString();
  const ts  = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });

  if (result.success) {
    await supabase
      .from("integration_submissions")
      .update({
        status:       "success",
        updated_at:   now,
        completed_at: now,
      })
      .eq("id", id);

    const msg = `FADV approved ✅ (${ts})`;
    if (output_column_id) {
      await writeOutputCell(supabase, applicant_id, output_column_id, msg);
    }
    if (status_column_id && approved_label_id) {
      await writeStatusLabelCell(supabase, applicant_id, status_column_id, approved_label_id);
    }

    await logActivityEvent(supabase, {
      companyId:  company_id,
      jobId:      job_id ?? null,
      actorType:  "system",
      eventType:  "fadv.approve.success",
      entityType: "applicant",
      entityId:   applicant_id,
      summary:    `FADV order approved (Review & Place Order) for profile ${profileId}`,
      data: {
        applicant_id:  applicant_id,
        submission_id: id,
        profile_id:    profileId,
      },
    });

    console.log("[fadv_approve/process-queue] ✓ Approve succeeded:", id);
  } else {
    const errorCode = (result.error ?? "unknown_error").slice(0, 80);

    await supabase
      .from("integration_submissions")
      .update({
        status:        "failed",
        error_code:    errorCode,
        error_message: result.error ?? "FADV approve failed",
        updated_at:    now,
        completed_at:  now,
      })
      .eq("id", id);

    const msg = `FADV Approve failed ❌ ${errorCode}`;
    if (output_column_id) {
      await writeOutputCell(supabase, applicant_id, output_column_id, msg);
    }
    if (status_column_id && error_label_id) {
      await writeStatusLabelCell(supabase, applicant_id, status_column_id, error_label_id);
    }

    await logActivityEvent(supabase, {
      companyId:  company_id,
      jobId:      job_id ?? null,
      actorType:  "system",
      eventType:  "fadv.approve.failed",
      entityType: "applicant",
      entityId:   applicant_id,
      summary:    `FADV approve failed: ${result.error ?? "unknown"}`,
      data: {
        applicant_id:  applicant_id,
        submission_id: id,
        profile_id:    profileId,
        error:         result.error ?? null,
      },
    });

    console.error("[fadv_approve/process-queue] ✗ Approve failed:", id, result.error);
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Marks a submission as failed and (optionally) writes to the output column.
 */
async function markFailed(
  supabase:         ReturnType<typeof createServiceClient>,
  submissionId:     string,
  applicantId:      string,
  jobId:            string | null,
  companyId:        string,
  outputColumnId:   string | null,
  errorCode:        string,
  errorMessage:     string,
  outputMsg:        string,
  provider:         "fadv" | "fadv_approve" | "safety_trainer" = "fadv"
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

  const eventType = provider === "safety_trainer"
    ? "safety_trainer.submission.failed"
    : provider === "fadv_approve"
    ? "fadv.approve.failed"
    : "fadv.submission.failed";
  const summaryPrefix = provider === "safety_trainer" ? "Safety Trainer" : provider === "fadv_approve" ? "FADV Approve" : "FADV";

  await logActivityEvent(supabase, {
    companyId,
    jobId,
    actorType:  "system",
    eventType,
    entityType: "applicant",
    entityId:   applicantId,
    summary:    `${summaryPrefix} submission failed: ${errorMessage}`,
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
async function writeStatusLabelCell(
  supabase:    ReturnType<typeof createServiceClient>,
  applicantId: string,
  columnId:    string,
  labelId:     string
) {
  const { error } = await supabase
    .from("board_cells")
    .upsert(
      {
        applicant_id:          applicantId,
        column_id:             columnId,
        value_status_label_id: labelId,
        value_text:            null,
        value_number:          null,
        value_date:            null,
        value_file_path:       null,
      },
      { onConflict: "applicant_id,column_id" }
    );

  if (error) {
    console.error("[fadv/process-queue] writeStatusLabelCell error (non-fatal):", error);
  }
}

async function writeOutputCell(
  supabase:    ReturnType<typeof createServiceClient>,
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
