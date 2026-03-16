"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications/createNotification";

function dashPath(companyId: string, jobId: string) {
  return `/dashboard/${companyId}/jobs/${jobId}/knowledge-base`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KBEntry {
  id: string;
  job_id: string;
  company_id: string;
  question: string;
  answer: string;
  sort_order: number;
  agent_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface KBSuggestion {
  id: string;
  job_id: string;
  company_id: string;
  agent_id: string | null;
  question: string;
  answer: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
  automation_agents?: { id: string; name: string; emoji: string } | null;
}

// ─── Entries ──────────────────────────────────────────────────────────────────

/**
 * Get all KB entries for a job, including agent assignments.
 */
export async function getKnowledgeBaseEntries(jobId: string): Promise<KBEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_knowledge_base")
    .select(`
      id, job_id, company_id, question, answer, sort_order, created_at, updated_at,
      job_kb_entry_agents ( agent_id )
    `)
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    job_id: row.job_id,
    company_id: row.company_id,
    question: row.question,
    answer: row.answer,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    agent_ids: (row.job_kb_entry_agents ?? []).map((r: any) => r.agent_id) as string[],
  }));
}

/**
 * Create a new KB entry with optional agent assignments.
 */
export async function createKnowledgeBaseEntry(
  companyId: string,
  jobId: string,
  entry: { question: string; answer: string },
  agentIds: string[] = []
): Promise<KBEntry> {
  const supabase = await createClient();

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
    .select("id, job_id, company_id, question, answer, sort_order, created_at, updated_at")
    .single();

  if (error) throw new Error(error.message);

  if (agentIds.length > 0) {
    const { error: jErr } = await supabase
      .from("job_kb_entry_agents")
      .insert(agentIds.map((agent_id) => ({ entry_id: data.id, agent_id })));
    if (jErr) console.warn("[createKnowledgeBaseEntry] agent insert:", jErr.message);
  }

  revalidatePath(dashPath(companyId, jobId));
  return { ...data, agent_ids: agentIds };
}

/**
 * Update a KB entry's question/answer, and optionally reassign agents.
 * Pass agentIds to replace assignments; omit to leave them unchanged.
 */
export async function updateKnowledgeBaseEntry(
  companyId: string,
  jobId: string,
  entryId: string,
  updates: { question?: string; answer?: string },
  agentIds?: string[]
): Promise<KBEntry> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_knowledge_base")
    .update(updates)
    .eq("id", entryId)
    .eq("job_id", jobId)
    .select("id, job_id, company_id, question, answer, sort_order, created_at, updated_at")
    .single();

  if (error) throw new Error(error.message);

  let finalAgentIds: string[];

  if (agentIds !== undefined) {
    await supabase.from("job_kb_entry_agents").delete().eq("entry_id", entryId);
    if (agentIds.length > 0) {
      await supabase
        .from("job_kb_entry_agents")
        .insert(agentIds.map((agent_id) => ({ entry_id: entryId, agent_id })));
    }
    finalAgentIds = agentIds;
  } else {
    const { data: existing } = await supabase
      .from("job_kb_entry_agents")
      .select("agent_id")
      .eq("entry_id", entryId);
    finalAgentIds = (existing ?? []).map((r: any) => r.agent_id);
  }

  revalidatePath(dashPath(companyId, jobId));
  return { ...data, agent_ids: finalAgentIds };
}

/**
 * Delete a KB entry. Junction rows are removed by CASCADE.
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
 * Reorder KB entries. entryIds is the full ordered list.
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

// ─── Suggestions ──────────────────────────────────────────────────────────────

/**
 * Get all pending suggestions for a job, with agent info.
 */
export async function getKBSuggestions(jobId: string): Promise<KBSuggestion[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_kb_suggestions")
    .select(`
      id, job_id, company_id, agent_id, question, answer, status, created_at, updated_at,
      automation_agents ( id, name, emoji )
    `)
    .eq("job_id", jobId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KBSuggestion[];
}

/**
 * Approve a suggestion: creates a KB entry and marks the suggestion approved.
 * Returns the created entry so the client can update local state.
 */
export async function approveKBSuggestion(
  companyId: string,
  jobId: string,
  suggestionId: string,
  edits: { question: string; answer: string },
  agentIds: string[]
): Promise<KBEntry> {
  const created = await createKnowledgeBaseEntry(companyId, jobId, edits, agentIds);

  const supabase = await createClient();
  await supabase
    .from("job_kb_suggestions")
    .update({ status: "approved" })
    .eq("id", suggestionId);

  revalidatePath(dashPath(companyId, jobId));
  return created;
}

/**
 * Reject (dismiss) a suggestion.
 */
export async function rejectKBSuggestion(
  companyId: string,
  jobId: string,
  suggestionId: string
) {
  const supabase = await createClient();

  await supabase
    .from("job_kb_suggestions")
    .update({ status: "rejected" })
    .eq("id", suggestionId);

  revalidatePath(dashPath(companyId, jobId));
}

/**
 * Create a suggestion (called by agents or via the "Suggest" UI button).
 */
export async function createKBSuggestion(
  companyId: string,
  jobId: string,
  agentId: string | null,
  question: string,
  answer: string
): Promise<KBSuggestion> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_kb_suggestions")
    .insert({
      job_id: jobId,
      company_id: companyId,
      agent_id: agentId,
      question,
      answer,
    })
    .select(`
      id, job_id, company_id, agent_id, question, answer, status, created_at, updated_at,
      automation_agents ( id, name, emoji )
    `)
    .single();

  if (error) throw new Error(error.message);

  const suggestion = data as unknown as KBSuggestion;

  // Fire a notification so team members know there's a new suggestion to review
  const agentLabel = suggestion.automation_agents
    ? `${suggestion.automation_agents.emoji} ${suggestion.automation_agents.name}`
    : "An agent";
  const truncated = (question || "").slice(0, 80) + (question.length > 80 ? "…" : "");
  await createNotification(supabase, {
    companyId,
    jobId,
    type: "info",
    title: `${agentLabel} suggested a new Q&A`,
    body: truncated || undefined,
    metadata: {
      source: "kb_suggestion",
      path: dashPath(companyId, jobId),
    },
  });

  revalidatePath(dashPath(companyId, jobId));
  return suggestion;
}
