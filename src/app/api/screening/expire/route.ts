/**
 * POST /api/screening/expire
 *
 * Cron endpoint that marks overdue screening submissions as expired.
 * Should run hourly (or more frequently).
 *
 * Security: Vercel sets Authorization: Bearer <CRON_SECRET> on cron invocations.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();

  const { data: expired, error } = await svc
    .from("screening_submissions")
    .update({ status: "expired" })
    .in("status", ["sent", "started"])
    .lt("expires_at", now)
    .not("expires_at", "is", null)
    .select("id");

  if (error) {
    console.error("[screening/expire] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = expired?.length ?? 0;
  console.log(`[screening/expire] Marked ${count} submission(s) as expired`);

  return NextResponse.json({ success: true, expired: count });
}
