import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

    const svc = getSvc();

    // Verify token matches enrollmentId (security check)
    const { data: enrollment, error: enrollErr } = await svc
      .from("lms_enrollments")
      .select(`
        id,
        token,
        applicant_id,
        status,
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
    for (const q of questions) {
      if (answers[q.id] === q.correct_option_id) correct++;
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

    // Update enrollment status to in_progress if it was just enrolled
    if (enrollment.status === "enrolled") {
      await svc
        .from("lms_enrollments")
        .update({ status: "in_progress" })
        .eq("id", enrollmentId);
    }

    let courseCompleted = false;

    // Check if this completion finishes the course
    if (passed) {
      const thisMod = allModules.find((m: any) => m.id === moduleId);
      const isFinalExam = thisMod?.is_final_exam ?? false;

      if (isFinalExam) {
        // Final exam passed → course complete
        const { error: completeErr } = await svc
          .from("lms_enrollments")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", enrollmentId);

        if (!completeErr) {
          courseCompleted = true;

          // Fire lms.course_completed automation trigger
          try {
            // Look up the applicant to find their job
            const { data: applicant } = await svc
              .from("applicants")
              .select("id, job_id, company_id")
              .eq("id", enrollment.applicant_id)
              .single();

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
            // Don't fail the response if trigger firing fails
            console.error("[submit-quiz] Failed to fire lms.course_completed trigger:", triggerErr);
          }
        }
      }
    }

    return NextResponse.json({ score, passed, correct, total, courseCompleted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[submit-quiz] Unexpected error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
