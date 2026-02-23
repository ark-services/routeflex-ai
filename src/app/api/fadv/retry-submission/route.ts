/**
 * POST /api/fadv/retry-submission
 *
 * Resets a failed FADV submission back to 'queued' so the next process-queue
 * cron run will pick it up and try again.
 *
 * Body: { submissionId: string }
 *
 * Security: requires a valid user session via Supabase Auth cookie.
 * RLS on integration_submissions restricts access to the caller's company.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  let body: { submissionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { submissionId } = body;
  if (!submissionId?.trim()) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );

  // Verify session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reset the submission to queued.
  // RLS on integration_submissions ensures the caller can only see/update
  // submissions belonging to their own company.
  const { data, error } = await supabase
    .from("integration_submissions")
    .update({
      status:        "queued",
      error_code:    null,
      error_message: null,
      completed_at:  null,
      updated_at:    new Date().toISOString(),
    })
    .eq("id", submissionId)
    .eq("status", "failed")          // only reset genuinely failed rows
    .eq("provider", "fadv")
    .select("id, applicant_id, status")
    .maybeSingle();

  if (error) {
    console.error("[fadv/retry-submission] DB error:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (!data) {
    // Row not found, already queued/running/success, or belongs to another company
    return NextResponse.json(
      { error: "Submission not found or not in failed state" },
      { status: 404 }
    );
  }

  console.log("[fadv/retry-submission] Reset to queued:", data.id, "applicant:", data.applicant_id);
  return NextResponse.json({ success: true, submission: data });
}
