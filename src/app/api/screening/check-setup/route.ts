import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("job_id");
  if (!jobId) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: config } = await svc
    .from("screening_configs")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ has_questions: false });
  }

  const { count } = await svc
    .from("screening_questions")
    .select("id", { count: "exact", head: true })
    .eq("config_id", config.id);

  return NextResponse.json({ has_questions: (count ?? 0) > 0 });
}
