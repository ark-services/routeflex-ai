"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    throw new Error("Unauthorized");
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function createCourseTemplate(input: {
  name: string;
  description?: string;
  carrier_type?: string;
}) {
  await assertSuperAdmin();
  const svc = getServiceClient();
  const { data, error } = await svc
    .from("lms_course_templates")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      carrier_type: input.carrier_type?.trim() ?? null,
      is_published: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/super-admin/training/templates");
  return data.id as string;
}

export async function updateCourseTemplate(
  templateId: string,
  input: {
    name?: string;
    description?: string;
    carrier_type?: string;
    is_published?: boolean;
  }
) {
  await assertSuperAdmin();
  const svc = getServiceClient();
  const update: Record<string, any> = {};
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.description !== undefined) update.description = input.description.trim() || null;
  if (input.carrier_type !== undefined) update.carrier_type = input.carrier_type.trim() || null;
  if (input.is_published !== undefined) update.is_published = input.is_published;
  const { error } = await svc
    .from("lms_course_templates")
    .update(update)
    .eq("id", templateId);
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/training/templates/${templateId}`);
  revalidatePath("/super-admin/training/templates");
}

export async function deleteCourseTemplate(templateId: string) {
  await assertSuperAdmin();
  const svc = getServiceClient();
  const { error } = await svc
    .from("lms_course_templates")
    .delete()
    .eq("id", templateId);
  if (error) throw new Error(error.message);
  revalidatePath("/super-admin/training/templates");
}

// ── Template Modules ──────────────────────────────────────────────────────────

export async function createTemplateModule(
  templateId: string,
  input: { title: string; content?: string; is_final_exam?: boolean }
) {
  await assertSuperAdmin();
  const svc = getServiceClient();

  // Get max sort_order
  const { data: existing } = await svc
    .from("lms_template_modules")
    .select("sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const { data, error } = await svc
    .from("lms_template_modules")
    .insert({
      template_id: templateId,
      title: input.title.trim(),
      content: input.content?.trim() ?? "",
      is_final_exam: input.is_final_exam ?? false,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/training/templates/${templateId}`);
  return data.id as string;
}

export async function updateTemplateModule(
  moduleId: string,
  templateId: string,
  input: { title?: string; content?: string; is_final_exam?: boolean }
) {
  await assertSuperAdmin();
  const svc = getServiceClient();
  const update: Record<string, any> = {};
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.content !== undefined) update.content = input.content;
  if (input.is_final_exam !== undefined) update.is_final_exam = input.is_final_exam;
  const { error } = await svc
    .from("lms_template_modules")
    .update(update)
    .eq("id", moduleId);
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/training/templates/${templateId}/modules/${moduleId}`);
  revalidatePath(`/super-admin/training/templates/${templateId}`);
}

export async function deleteTemplateModule(moduleId: string, templateId: string) {
  await assertSuperAdmin();
  const svc = getServiceClient();
  const { error } = await svc
    .from("lms_template_modules")
    .delete()
    .eq("id", moduleId);
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/training/templates/${templateId}`);
}

// ── Template Questions ────────────────────────────────────────────────────────

export async function createTemplateQuestion(
  moduleId: string,
  templateId: string,
  input: {
    question_text: string;
    options: Array<{ id: string; text: string }>;
    correct_option_id: string;
  }
) {
  await assertSuperAdmin();
  const svc = getServiceClient();

  const { data: existing } = await svc
    .from("lms_template_questions")
    .select("sort_order")
    .eq("template_module_id", moduleId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const { data, error } = await svc
    .from("lms_template_questions")
    .insert({
      template_module_id: moduleId,
      question_text: input.question_text.trim(),
      options: input.options,
      correct_option_id: input.correct_option_id,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/training/templates/${templateId}/modules/${moduleId}`);
  return data.id as string;
}

export async function updateTemplateQuestion(
  questionId: string,
  moduleId: string,
  templateId: string,
  input: {
    question_text?: string;
    options?: Array<{ id: string; text: string }>;
    correct_option_id?: string;
  }
) {
  await assertSuperAdmin();
  const svc = getServiceClient();
  const update: Record<string, any> = {};
  if (input.question_text !== undefined) update.question_text = input.question_text.trim();
  if (input.options !== undefined) update.options = input.options;
  if (input.correct_option_id !== undefined) update.correct_option_id = input.correct_option_id;
  const { error } = await svc
    .from("lms_template_questions")
    .update(update)
    .eq("id", questionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/training/templates/${templateId}/modules/${moduleId}`);
}

export async function deleteTemplateQuestion(
  questionId: string,
  moduleId: string,
  templateId: string
) {
  await assertSuperAdmin();
  const svc = getServiceClient();
  const { error } = await svc
    .from("lms_template_questions")
    .delete()
    .eq("id", questionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/training/templates/${templateId}/modules/${moduleId}`);
}

export async function createTemplateQuestionsBulk(
  templateId: string,
  moduleId: string,
  questions: Array<{
    question_text: string;
    options: Array<{ id: string; text: string }>;
    correct_option_id: string;
  }>
) {
  await assertSuperAdmin();
  const svc = getServiceClient();

  const { data: existing } = await svc
    .from("lms_template_questions")
    .select("sort_order")
    .eq("template_module_id", moduleId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const baseOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1;

  const rows = questions.map((q, i) => ({
    template_module_id: moduleId,
    question_text: q.question_text.trim(),
    options: q.options,
    correct_option_id: q.correct_option_id,
    sort_order: baseOrder + i,
  }));

  const { data, error } = await svc
    .from("lms_template_questions")
    .insert(rows)
    .select("id, question_text, options, correct_option_id, sort_order");
  if (error) throw new Error(error.message);
  revalidatePath(`/super-admin/training/templates/${templateId}/modules/${moduleId}`);
  return data as Array<{
    id: string;
    question_text: string;
    options: Array<{ id: string; text: string }>;
    correct_option_id: string;
    sort_order: number;
  }>;
}
