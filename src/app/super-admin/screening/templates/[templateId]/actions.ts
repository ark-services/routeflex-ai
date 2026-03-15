"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

export async function updateTemplate(
  templateId: string,
  data: { name?: string; description?: string | null; is_active?: boolean }
) {
  const svc = createServiceClient();
  const { error } = await svc
    .from("screening_templates")
    .update(data)
    .eq("id", templateId);
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/screening/templates/${templateId}`);
  revalidatePath("/super-admin/screening/templates");
}

export async function addTemplateQuestion(
  templateId: string,
  data: {
    text: string;
    type: "multiple_choice" | "short_text" | "yes_no" | "number";
    sort_order: number;
  }
) {
  const svc = createServiceClient();
  const { error } = await svc.from("screening_template_questions").insert({
    template_id: templateId,
    ...data,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/screening/templates/${templateId}`);
}

export async function updateTemplateQuestion(
  questionId: string,
  templateId: string,
  data: Partial<{
    text: string;
    type: string;
    options: any;
    is_dealbreaker: boolean;
    dealbreaker_condition: any;
    ai_scoring_guidance: string | null;
  }>
) {
  const svc = createServiceClient();
  const { error } = await svc
    .from("screening_template_questions")
    .update(data)
    .eq("id", questionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/screening/templates/${templateId}`);
}

export async function deleteTemplateQuestion(questionId: string, templateId: string) {
  const svc = createServiceClient();
  const { error } = await svc
    .from("screening_template_questions")
    .delete()
    .eq("id", questionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/screening/templates/${templateId}`);
}

export async function reorderTemplateQuestions(
  updates: { id: string; sort_order: number }[],
  templateId: string
) {
  const svc = createServiceClient();
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      svc.from("screening_template_questions").update({ sort_order }).eq("id", id)
    )
  );
  revalidatePath(`/super-admin/screening/templates/${templateId}`);
}
