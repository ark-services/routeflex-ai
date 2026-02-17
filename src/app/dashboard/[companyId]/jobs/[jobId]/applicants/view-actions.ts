"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Types (shared with client components) ────────────────────────────────────

export type FilterCondition =
  | "contains"
  | "equals"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than"
  | "before"
  | "after"
  | "is"
  | "is_not";

export type ActiveFilter = {
  id: string; // client-side key
  columnId: string;
  condition: FilterCondition;
  value: string;
  /** Row 1 has no joiner (always "Where"). Rows 2+ default to "and". */
  joiner?: "and" | "or";
};

export type BoardViewQuery = {
  search: string;
  filters: ActiveFilter[];
  logic: "and";
};

export type BoardView = {
  id: string;
  name: string;
  query: BoardViewQuery;
  position: number;
  is_default: boolean;
};

// ─── Read ──────────────────────────────────────────────────────────────────────

export async function getBoardViews(
  companyId: string,
  boardId: string
): Promise<BoardView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("board_views")
    .select("id, name, query, position, is_default")
    .eq("company_id", companyId)
    .eq("board_id", boardId)
    .order("position", { ascending: true });
  return (data as BoardView[]) ?? [];
}

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createBoardView(
  companyId: string,
  jobId: string,
  boardId: string,
  name: string,
  query: BoardViewQuery
): Promise<{ data?: BoardView; error?: string }> {
  const supabase = await createClient();

  // Max position
  const { data: existing } = await supabase
    .from("board_views")
    .select("position")
    .eq("board_id", boardId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = ((existing?.[0]?.position as number) ?? -1) + 1;

  const { data, error } = await supabase
    .from("board_views")
    .insert({
      company_id: companyId,
      job_id: jobId,
      board_id: boardId,
      name,
      query,
      position: nextPosition,
      is_default: false,
    })
    .select("id, name, query, position, is_default")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  return { data: data as BoardView };
}

// ─── Update ────────────────────────────────────────────────────────────────────

export async function updateBoardView(
  companyId: string,
  jobId: string,
  viewId: string,
  updates: Partial<{ name: string; query: BoardViewQuery; position: number }>
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("board_views")
    .update(updates)
    .eq("id", viewId)
    .eq("company_id", companyId);

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  return {};
}

// ─── Delete ────────────────────────────────────────────────────────────────────

export async function deleteBoardView(
  companyId: string,
  jobId: string,
  viewId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("board_views")
    .delete()
    .eq("id", viewId)
    .eq("company_id", companyId);

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  return {};
}

// ─── Duplicate ─────────────────────────────────────────────────────────────────

export async function duplicateBoardView(
  companyId: string,
  jobId: string,
  boardId: string,
  viewId: string
): Promise<{ data?: BoardView; error?: string }> {
  const supabase = await createClient();

  const { data: original } = await supabase
    .from("board_views")
    .select("*")
    .eq("id", viewId)
    .eq("company_id", companyId)
    .single();

  if (!original) return { error: "View not found" };

  const { data: existing } = await supabase
    .from("board_views")
    .select("position")
    .eq("board_id", boardId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = ((existing?.[0]?.position as number) ?? -1) + 1;

  const { data, error } = await supabase
    .from("board_views")
    .insert({
      company_id: companyId,
      job_id: jobId,
      board_id: boardId,
      name: `${original.name} (copy)`,
      query: original.query,
      position: nextPosition,
      is_default: false,
    })
    .select("id, name, query, position, is_default")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  return { data: data as BoardView };
}

// ─── Reorder ───────────────────────────────────────────────────────────────────

export async function reorderBoardViews(
  companyId: string,
  jobId: string,
  viewIds: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient();

  for (let i = 0; i < viewIds.length; i++) {
    const { error } = await supabase
      .from("board_views")
      .update({ position: i })
      .eq("id", viewIds[i])
      .eq("company_id", companyId);
    if (error) return { error: error.message };
  }

  revalidatePath(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
  return {};
}
