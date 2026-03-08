import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, enrollmentId, moduleId, answers } = body as {
      token: string;
      enrollmentId: string;
      moduleId: string;
      answers: Record<string, string>; // questionId → optionId
    };

    if (!token || !enrollmentId || !moduleId || !answers) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const svc = createServiceClient();

    // Verify token matches enrollmentId (security check)
    const { data: enrollment, error: enrollErr } = await svc
      .from("lms_enrollments")
      .select(`
        id,
        token,
        applicant_id,
        status,
        output_column_id,
        status_column_id,
        in_progress_label_id,
        passed_label_id,
        failed_label_id,
        lms_courses (
          id,
          company_id,
          passing_threshold,
          lms_modules (
            id,
            is_final_exam,
            sort_order
          )
        )
      `)
      .eq("id", enrollmentId)
      .eq("token", token)
      .single();

    if (enrollErr || !enrollment) {
      return NextResponse.json({ error: "Invalid enrollment" }, { status: 403 });
    }

    const course = (enrollment as any).lms_courses;
    const passingThreshold: number = course.passing_threshold ?? 80;
    const allModules: any[] = (course?.lms_modules ?? []).sort(
      (a: any, b: any) => a.sort_order - b.sort_order
    );

    // Load questions with correct answers
    const { data: questions, error: qErr } = await svc
      .from("lms_questions")
      .select("id, correct_option_id")
      .eq("module_id", moduleId);

    if (qErr || !questions || questions.length === 0) {
      return NextResponse.json({ error: "Module questions not found" }, { status: 404 });
    }

    // Score the attempt
    let correct = 0;
    const review: Array<{
      questionId: string;
      isCorrect: boolean;
      chosenOptionId: string;
      correctOptionId: string;
    }> = [];
    for (const q of questions) {
      const isCorrect = answers[q.id] === q.correct_option_id;
      if (isCorrect) correct++;
      review.push({
        questionId: q.id,
        isCorrect,
        chosenOptionId: answers[q.id] ?? "",
        correctOptionId: q.correct_option_id,
      });
    }
    const total = questions.length;
    const score = Math.round((correct / total) * 100);
    const passed = score >= passingThreshold;

    // Determine attempt number
    const { count: prevAttempts } = await svc
      .from("lms_module_attempts")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId)
      .eq("module_id", moduleId);

    const attemptNumber = (prevAttempts ?? 0) + 1;

    // Record the attempt
    const { error: insertErr } = await svc.from("lms_module_attempts").insert({
      enrollment_id: enrollmentId,
      module_id: moduleId,
      attempt_number: attemptNumber,
      answers,
      score,
      passed,
    });

    if (insertErr) {
      console.error("[submit-quiz] Failed to insert attempt:", insertErr);
      return NextResponse.json({ error: "Failed to record attempt" }, { status: 500 });
    }

    // ── Board write helpers ───────────────────────────────────────────────────
    const applicantId = enrollment.applicant_id;
    const outputColId = (enrollment as any).output_column_id as string | null;
    const statusColId = (enrollment as any).status_column_id as string | null;
    const inProgressLabelId = (enrollment as any).in_progress_label_id as string | null;
    const passedLabelId = (enrollment as any).passed_label_id as string | null;
    const failedLabelId = (enrollment as any).failed_label_id as string | null;

    async function writeTextCell(text: string) {
      if (!outputColId) return;
      await svc.from("board_cells").upsert(
        { applicant_id: applicantId, column_id: outputColId, value_text: text,
          value_number: null, value_date: null, value_status_label_id: null, value_file_path: null },
        { onConflict: "applicant_id,column_id" }
      );
    }

    async function writeStatusCell(labelId: string | null, applicant: { job_id: string; company_id: string; id: string }) {
      if (!statusColId || !labelId) return;
      const oldCell = await svc.from("board_cells").select("value_status_label_id")
        .eq("applicant_id", applicantId).eq("column_id", statusColId).maybeSingle();
      const oldLabelId = oldCell.data?.value_status_label_id ?? null;
      await svc.from("board_cells").upsert(
        { applicant_id: applicantId, column_id: statusColId, value_status_label_id: labelId,
          value_text: null, value_number: null, value_date: null, value_file_path: null },
        { onConflict: "applicant_id,column_id" }
      );
      // Fire board.status_changes_to trigger so downstream automations can chain
      if (labelId !== oldLabelId) {
        try {
          await fireJobTrigger(svc, {
            companyId: applicant.company_id,
            jobId: applicant.job_id,
            trigger_key: "board.status_changes_to",
            subject_type: "applicant",
            subject_id: applicant.id,
            payload: {
              company_id: applicant.company_id,
              job_id: applicant.job_id,
              applicant_id: applicant.id,
              column_id: statusColId,
              old_value: oldLabelId,
              new_value: labelId,
            },
          });
        } catch (err) {
          console.error("[submit-quiz] Failed to fire board.status_changes_to (non-fatal):", err);
        }
      }
    }

    // Look up applicant once (needed for trigger + completion)
    const { data: applicant } = await svc
      .from("applicants")
      .select("id, job_id, company_id")
      .eq("id", applicantId)
      .single();

    // Update enrollment status to in_progress if it was just enrolled
    if (enrollment.status === "enrolled") {
      await svc
        .from("lms_enrollments")
        .update({ status: "in_progress" })
        .eq("id", enrollmentId);
      // Set In Progress status label
      if (applicant) await writeStatusCell(inProgressLabelId, applicant);
    }

    // ── Progress text update ─────────────────────────────────────────────────
    // Count how many distinct modules have been passed (including this attempt if passed)
    const { count: passedCount } = await svc
      .from("lms_module_attempts")
      .select("module_id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId)
      .eq("passed", true);

    const totalModules = allModules.length;
    const regularModules = allModules.filter((m: any) => !m.is_final_exam).length;
    const passedModules = Math.min(passedCount ?? 0, regularModules);
    await writeTextCell(`In Progress · ${passedModules}/${regularModules} modules`);

    let courseCompleted = false;

    // Check if this is the final exam and handle pass/fail
    const thisMod = allModules.find((m: any) => m.id === moduleId);
    const isFinalExam = thisMod?.is_final_exam ?? false;

    if (isFinalExam && passed) {
      // Final exam passed → course complete
      const { error: completeErr } = await svc
        .from("lms_enrollments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", enrollmentId);

      if (!completeErr) {
        courseCompleted = true;
        await writeTextCell(`Completed ✅ · ${score}% on final exam`);
        if (applicant) await writeStatusCell(passedLabelId, applicant);

        // Fire lms.course_completed automation trigger
        try {
          if (applicant) {
            await fireJobTrigger(svc, {
              companyId: applicant.company_id,
              jobId: applicant.job_id,
              trigger_key: "lms.course_completed",
              subject_type: "applicant",
              subject_id: applicant.id,
              payload: {
                applicant_id: applicant.id,
                enrollment_id: enrollmentId,
                course_id: course.id,
                score,
              },
            });
          }
        } catch (triggerErr) {
          console.error("[submit-quiz] Failed to fire lms.course_completed trigger:", triggerErr);
        }
      }
    } else if (isFinalExam && !passed) {
      // Final exam failed
      await writeTextCell(`Exam failed · ${score}% (need ${passingThreshold}%)`);
      if (applicant) await writeStatusCell(failedLabelId, applicant);
    }

    return NextResponse.json({ score, passed, correct, total, courseCompleted, review });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[submit-quiz] Unexpected error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
