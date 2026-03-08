"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function dashPath(companyId: string, jobId: string) {
  return `/dashboard/${companyId}/jobs/${jobId}/knowledge-base`;
}

/**
 * Get all knowledge base entries for a job, ordered by sort_order.
 */
export async function getKnowledgeBaseEntries(jobId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_knowledge_base")
    .select("id, job_id, company_id, question, answer, sort_order, created_at, updated_at")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Create a new knowledge base entry with auto-incremented sort_order.
 */
export async function createKnowledgeBaseEntry(
  companyId: string,
  jobId: string,
  entry: { question: string; answer: string }
) {
  const supabase = await createClient();

  // Get max sort_order
  const { data: existing } = await supabase
    .from("job_knowledge_base")
    .select("sort_order")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSortOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("job_knowledge_base")
    .insert({
      job_id: jobId,
      company_id: companyId,
      question: entry.question,
      answer: entry.answer,
      sort_order: nextSortOrder,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId, jobId));
  return data;
}

/**
 * Update a knowledge base entry's question and/or answer.
 */
export async function updateKnowledgeBaseEntry(
  companyId: string,
  jobId: string,
  entryId: string,
  updates: { question?: string; answer?: string }
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_knowledge_base")
    .update(updates)
    .eq("id", entryId)
    .eq("job_id", jobId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId, jobId));
  return data;
}

/**
 * Delete a knowledge base entry.
 */
export async function deleteKnowledgeBaseEntry(
  companyId: string,
  jobId: string,
  entryId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("job_knowledge_base")
    .delete()
    .eq("id", entryId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  revalidatePath(dashPath(companyId, jobId));
}

/**
 * Reorder knowledge base entries. entryIds is the full ordered list.
 */
export async function reorderKnowledgeBaseEntries(
  companyId: string,
  jobId: string,
  entryIds: string[]
) {
  const supabase = await createClient();

  await Promise.all(
    entryIds.map((id, index) =>
      supabase
        .from("job_knowledge_base")
        .update({ sort_order: index + 1 })
        .eq("id", id)
        .eq("job_id", jobId)
    )
  );

  revalidatePath(dashPath(companyId, jobId));
}
