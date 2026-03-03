/**
 * POST /api/webhooks/ingest
 *
 * Inbound webhook for creating applicants from external sources (e.g. Zapier).
 * Secured with a Bearer token via the WEBHOOK_API_KEY env var.
 *
 * Request body (JSON):
 *   job_id        (required) UUID of the target job
 *   full_name     (required) Applicant name
 *   email         (optional) Email — also used for dedup within the job
 *   phone         (optional) Phone number
 *   group_name    (optional) Board group name (case-insensitive). Falls back to default group.
 *   fedex_id      (optional) Driver's FedEx ID
 *   terminal_preference (optional)
 *   experience    (optional)
 *   resume_link   (optional) External URL to resume
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getOrCreateApplicantsBoard } from "@/lib/boards/getOrCreateApplicantsBoard";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";

export const maxDuration = 30;

function makeServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const webhookKey = process.env.WEBHOOK_API_KEY;
  if (!webhookKey) {
    console.error("[webhook/ingest] WEBHOOK_API_KEY not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${webhookKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    job_id,
    full_name,
    email,
    phone,
    group_name,
    fedex_id,
    terminal_preference,
    experience,
    resume_link,
  } = body as Record<string, string | undefined>;

  if (!job_id || typeof job_id !== "string") {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }
  if (!full_name || typeof full_name !== "string") {
    return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  }

  const supabase = makeServiceClient();

  // ── 3. Validate job exists ────────────────────────────────────────────────
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, company_id")
    .eq("id", job_id)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // ── 4. Duplicate check (email + job_id) ───────────────────────────────────
  if (email && typeof email === "string" && email.trim()) {
    const { data: existing } = await supabase
      .from("applicants")
      .select("id")
      .eq("job_id", job_id)
      .eq("email", email.trim())
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        created: false,
        applicant_id: existing.id,
        message: "Applicant with this email already exists for this job",
      });
    }
  }

  // ── 5. Get or create board ────────────────────────────────────────────────
  const boardResult = await getOrCreateApplicantsBoard(
    supabase,
    job.company_id,
    job_id
  );

  if (!boardResult.success) {
    console.error("[webhook/ingest] Board error:", boardResult.error);
    return NextResponse.json({ error: "Failed to resolve board" }, { status: 500 });
  }

  const { board, groups } = boardResult;

  // ── 6. Resolve destination group ──────────────────────────────────────────
  let destinationGroup = null;

  if (group_name && typeof group_name === "string") {
    const normalized = group_name.toLowerCase().trim();
    destinationGroup = groups.find(
      (g) => g.name.toLowerCase().trim() === normalized
    );
  }

  // Fallback: default group, then first group
  if (!destinationGroup) {
    destinationGroup =
      groups.find((g) => g.is_default_for_applications) ?? groups[0] ?? null;
  }

  if (!destinationGroup) {
    return NextResponse.json({ error: "No board groups available" }, { status: 500 });
  }

  // ── 7. Next position in group ─────────────────────────────────────────────
  const { data: maxPos } = await supabase
    .from("applicants")
    .select("position")
    .eq("group_id", destinationGroup.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = maxPos ? maxPos.position + 1 : 0;

  // ── 8. Insert applicant ───────────────────────────────────────────────────
  const { data: applicant, error: insertError } = await supabase
    .from("applicants")
    .insert({
      company_id: job.company_id,
      job_id,
      board_id: board.id,
      group_id: destinationGroup.id,
      full_name: full_name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      terminal_preference: terminal_preference?.trim() || "",
      experience: experience?.trim() || "",
      resume_path: resume_link?.trim() || null,
      status: "applied",
      position: nextPosition,
    })
    .select("id")
    .single();

  if (insertError || !applicant) {
    console.error("[webhook/ingest] Insert failed:", insertError);
    return NextResponse.json({ error: "Failed to create applicant" }, { status: 500 });
  }

  // ── 9. Populate board_cells for common column types ───────────────────────
  // Non-system board columns (email, phone, First Name, Last Name) read from
  // board_cells. The applicants row has the raw values — mirror them so the
  // board renders correctly without a form submission.
  try {
    const { data: boardColumns } = await supabase
      .from("board_columns")
      .select("id, name, type, is_system")
      .eq("board_id", board.id);

    if (boardColumns && boardColumns.length > 0) {
      const nameParts = full_name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") ?? "";

      const cellInserts: { applicant_id: string; column_id: string; value_text: string }[] = [];

      for (const col of boardColumns) {
        if (col.is_system) continue;
        const n = col.name.toLowerCase().trim();

        let value: string | null = null;
        if (col.type === "email") {
          value = email?.trim() || null;
        } else if (col.type === "phone") {
          value = phone?.trim() || null;
        } else if (n === "first name" || n === "firstname") {
          value = firstName || null;
        } else if (n === "last name" || n === "lastname") {
          value = lastName || null;
        } else if (n === "fedex id" || n === "fedex_id" || n === "fedexid") {
          value = fedex_id?.trim() || null;
        }

        if (value) {
          cellInserts.push({ applicant_id: applicant.id, column_id: col.id, value_text: value });
        }
      }

      if (cellInserts.length > 0) {
        await supabase.from("board_cells").insert(cellInserts);
      }
    }
  } catch (cellError) {
    console.error("[webhook/ingest] Board cells population error (non-fatal):", cellError);
  }

  // ── 10. Fire applicant.created automation trigger ─────────────────────────
  try {
    await fireJobTrigger(supabase, {
      companyId: job.company_id,
      jobId: job_id,
      trigger_key: "applicant.created",
      subject_type: "applicant",
      subject_id: applicant.id,
      payload: {
        company_id: job.company_id,
        job_id: job_id,
        board_id: board.id,
        applicant_id: applicant.id,
        group_id: destinationGroup.id,
        source: "webhook",
      },
    });
  } catch (triggerError) {
    console.error("[webhook/ingest] Trigger error (non-fatal):", triggerError);
  }

  // ── 11. Return success ────────────────────────────────────────────────────
  return NextResponse.json(
    {
      created: true,
      applicant_id: applicant.id,
      group_id: destinationGroup.id,
      group_name: destinationGroup.name,
    },
    { status: 201 }
  );
}
