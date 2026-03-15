import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { evaluateDealbreakers } from "@/lib/screening/dealbreakers";
import { getDriveTimeAndDistance } from "@/lib/screening/distance";
import { runCompositeScoring } from "@/lib/screening/score";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, submissionId, answers } = body as {
      token: string;
      submissionId: string;
      answers: Record<string, string | number | boolean>;
    };

    if (!token || !submissionId || !answers) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const svc = createServiceClient();

    // ── Validate submission ─────────────────────────────────────────────────────
    const { data: submission, error: submissionError } = await svc
      .from("screening_submissions")
      .select(`
        id,
        token,
        status,
        applicant_id,
        job_id,
        config_id,
        screening_configs (
          id,
          auto_reject_dealbreakers,
          jobs (
            id,
            company_id,
            terminal_address
          ),
          screening_questions (
            id,
            sort_order,
            text,
            type,
            options,
            is_dealbreaker,
            dealbreaker_condition,
            ai_scoring_guidance
          )
        )
      `)
      .eq("id", submissionId)
      .eq("token", token)
      .maybeSingle();

    if (submissionError || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.status === "completed" || submission.status === "auto_rejected") {
      return NextResponse.json({ error: "This screening has already been submitted" }, { status: 409 });
    }

    if (submission.status === "expired") {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    const config = (submission as any).screening_configs;
    const job = config?.jobs;
    const questions: any[] = ((config?.screening_questions ?? []) as any[]).sort(
      (a: any, b: any) => a.sort_order - b.sort_order
    );

    // ── Save responses ──────────────────────────────────────────────────────────
    const responseRows = questions.map((q: any) => {
      const raw = answers[q.id];
      const row: any = {
        submission_id: submission.id,
        question_id: q.id,
      };

      if (q.type === "yes_no") {
        if (typeof raw === "boolean") {
          row.value_boolean = raw;
          row.value_text = raw ? "yes" : "no";
        } else if (typeof raw === "string") {
          row.value_text = raw;
          row.value_boolean = raw === "yes";
        }
      } else if (q.type === "number") {
        row.value_number = typeof raw === "number" ? raw : Number(raw);
      } else {
        row.value_text = String(raw ?? "");
      }

      return row;
    });

    await svc.from("screening_responses").insert(responseRows);

    // ── Evaluate dealbreakers ───────────────────────────────────────────────────
    const responseObjects = responseRows.map((r: any) => ({
      questionId: r.question_id,
      valueText: r.value_text ?? null,
      valueNumber: r.value_number ?? null,
      valueBoolean: r.value_boolean ?? null,
    }));

    const dealBreakerResults = evaluateDealbreakers(questions, responseObjects);
    const failedDealbreakers = dealBreakerResults.filter((r) => r.failed);

    // Mark dealbreaker failure flags on responses
    if (failedDealbreakers.length > 0) {
      const failedIds = new Set(failedDealbreakers.map((r) => r.questionId));
      for (const row of responseRows) {
        if (failedIds.has(row.question_id)) {
          await svc
            .from("screening_responses")
            .update({ is_dealbreaker_failure: true })
            .eq("submission_id", submission.id)
            .eq("question_id", row.question_id);
        }
      }

      if (config?.auto_reject_dealbreakers) {
        await svc
          .from("screening_submissions")
          .update({ status: "auto_rejected", completed_at: new Date().toISOString() })
          .eq("id", submission.id);

        return NextResponse.json({ success: true, autoRejected: true });
      }
    }

    // ── Calculate distance ──────────────────────────────────────────────────────
    let distanceMiles: number | null = null;
    let driveTimeMinutes: number | null = null;

    const terminalAddress = job?.terminal_address?.trim();
    if (terminalAddress) {
      // Try to get applicant's address from form fields
      const { data: applicantAddress } = await svc
        .from("applicant_field_values")
        .select(`
          value_text,
          job_application_fields!inner (type)
        `)
        .eq("applicant_id", submission.applicant_id)
        .eq("job_application_fields.type", "location")
        .not("value_text", "is", null)
        .limit(1)
        .maybeSingle();

      const originAddress = applicantAddress?.value_text ?? null;
      if (originAddress) {
        const distResult = await getDriveTimeAndDistance(originAddress, terminalAddress);
        if (distResult) {
          distanceMiles = distResult.distanceMiles;
          driveTimeMinutes = distResult.driveTimeMinutes;
        }
      }
    }

    // ── Run AI composite scoring ─────────────────────────────────────────────────
    const scoringResult = await runCompositeScoring(
      svc,
      submission.applicant_id,
      submission.job_id,
      questions,
      responseObjects,
      distanceMiles,
      driveTimeMinutes
    );

    // Update screening_responses with per-question AI scores
    if (scoringResult?.questionScores?.length) {
      for (const qs of scoringResult.questionScores) {
        await svc
          .from("screening_responses")
          .update({ ai_question_score: qs.score })
          .eq("submission_id", submission.id)
          .eq("question_id", qs.questionId);
      }
    }

    // ── Mark completed ──────────────────────────────────────────────────────────
    await svc
      .from("screening_submissions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        ...(distanceMiles !== null && { distance_miles: distanceMiles }),
        ...(driveTimeMinutes !== null && { drive_time_minutes: driveTimeMinutes }),
        ...(scoringResult && {
          ai_score: scoringResult.score,
          ai_summary: scoringResult.summary,
          recommendation: scoringResult.recommendation,
        }),
      })
      .eq("id", submission.id);

    // ── Fire screening.completed automation trigger ────────────────────────────
    if (job?.company_id) {
      try {
        await fireJobTrigger(svc, {
          companyId: job.company_id,
          jobId: submission.job_id,
          trigger_key: "screening.completed",
          subject_type: "applicant",
          subject_id: submission.applicant_id,
          payload: {
            company_id: job.company_id,
            job_id: submission.job_id,
            applicant_id: submission.applicant_id,
            submission_id: submission.id,
            ai_score: scoringResult?.score ?? null,
            recommendation: scoringResult?.recommendation ?? null,
          },
        });
      } catch (err) {
        // Non-fatal — don't fail the response if automation trigger errors
        console.error("[screening/submit] Failed to fire screening.completed trigger:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[screening/submit] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
