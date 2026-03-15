"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

// ── Config ─────────────────────────────────────────────────────────────────────

export async function upsertScreeningConfig(
  jobId: string,
  companyId: string,
  data: {
    deadline_hours: number;
    auto_reject_dealbreakers: boolean;
  }
) {
  const svc = createServiceClient();

  const { error } = await svc
    .from("screening_configs")
    .upsert(
      {
        job_id: jobId,
        company_id: companyId,
        deadline_hours: data.deadline_hours,
        auto_reject_dealbreakers: data.auto_reject_dealbreakers,
      },
      { onConflict: "job_id" }
    );

  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/screening`);
}

// ── Questions ──────────────────────────────────────────────────────────────────

export async function addQuestion(
  configId: string,
  jobId: string,
  companyId: string,
  data: {
    text: string;
    type: "multiple_choice" | "short_text" | "yes_no" | "number";
    options?: { id: string; label: string }[];
    is_dealbreaker?: boolean;
    dealbreaker_condition?: Record<string, any> | null;
    ai_scoring_guidance?: string | null;
    sort_order: number;
  }
) {
  const svc = createServiceClient();
  const { error } = await svc.from("screening_questions").insert({
    config_id: configId,
    ...data,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/screening`);
}

export async function updateQuestion(
  questionId: string,
  jobId: string,
  companyId: string,
  data: Partial<{
    text: string;
    type: "multiple_choice" | "short_text" | "yes_no" | "number";
    options: { id: string; label: string }[] | null;
    is_dealbreaker: boolean;
    dealbreaker_condition: Record<string, any> | null;
    ai_scoring_guidance: string | null;
  }>
) {
  const svc = createServiceClient();
  const { error } = await svc
    .from("screening_questions")
    .update(data)
    .eq("id", questionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/screening`);
}

export async function deleteQuestion(
  questionId: string,
  jobId: string,
  companyId: string
) {
  const svc = createServiceClient();
  const { error } = await svc
    .from("screening_questions")
    .delete()
    .eq("id", questionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/screening`);
}

export async function reorderQuestions(
  updates: { id: string; sort_order: number }[],
  jobId: string,
  companyId: string
) {
  const svc = createServiceClient();
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      svc.from("screening_questions").update({ sort_order }).eq("id", id)
    )
  );
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/screening`);
}

// ── Template application ────────────────────────────────────────────────────────

export async function applyTemplate(
  templateId: string,
  configId: string,
  jobId: string,
  companyId: string
) {
  const svc = createServiceClient();

  const { data: templateQuestions, error } = await svc
    .from("screening_template_questions")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  if (!templateQuestions?.length) return;

  // Get current max sort_order to append after existing questions
  const { data: existing } = await svc
    .from("screening_questions")
    .select("sort_order")
    .eq("config_id", configId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const baseOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const rows = templateQuestions.map((tq, i) => ({
    config_id: configId,
    sort_order: baseOrder + i,
    text: tq.text,
    type: tq.type,
    options: tq.options,
    is_dealbreaker: tq.is_dealbreaker,
    dealbreaker_condition: tq.dealbreaker_condition,
    ai_scoring_guidance: tq.ai_scoring_guidance,
  }));

  const { error: insertError } = await svc
    .from("screening_questions")
    .insert(rows);

  if (insertError) throw new Error(insertError.message);
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/screening`);
}
