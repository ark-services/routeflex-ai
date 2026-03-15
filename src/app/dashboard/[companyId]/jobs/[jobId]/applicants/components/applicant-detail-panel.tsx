"use client";

import { useState, useEffect } from "react";
import { X, ClipboardList, Loader2, AlertTriangle } from "lucide-react";
import type { BoardCell } from "@/lib/types";
import type { Group, BoardColumn, StatusLabel } from "./types";
import { createClient } from "@/lib/supabase/client";

// ── Screening types ──────────────────────────────────────────────────────────

type ScreeningQuestion = {
  id: string;
  text: string;
  type: string;
  options: { id: string; label: string }[] | null;
  is_dealbreaker: boolean;
  sort_order: number;
};

type ScreeningResponse = {
  id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  ai_question_score: number | null;
  is_dealbreaker_failure: boolean;
  screening_questions: ScreeningQuestion;
};

type ScreeningSubmission = {
  id: string;
  status: string;
  ai_score: number | null;
  ai_summary: string | null;
  recommendation: string | null;
  distance_miles: number | null;
  drive_time_minutes: number | null;
  created_at: string;
  completed_at: string | null;
  screening_responses: ScreeningResponse[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: "bg-blue-50 text-blue-700 border-blue-200",
    started: "bg-yellow-50 text-yellow-700 border-yellow-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    expired: "bg-rf-ink-100 text-rf-text-muted border-rf-border",
    auto_rejected: "bg-red-50 text-red-700 border-red-200",
  };
  const labels: Record<string, string> = {
    sent: "Sent",
    started: "In Progress",
    completed: "Completed",
    expired: "Expired",
    auto_rejected: "Auto-Rejected",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[status] ?? "bg-rf-ink-100 text-rf-text-muted border-rf-border"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-green-700" : score >= 40 ? "text-yellow-700" : "text-red-700";
  const bg = score >= 70 ? "bg-green-50 border-green-200" : score >= 40 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-semibold ${bg} ${color}`}>
      {score}
    </span>
  );
}

function RecommendationBadge({ rec }: { rec: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ready_for_fadv: { label: "Ready for FADV", cls: "bg-green-50 text-green-700 border-green-200" },
    needs_review: { label: "Needs Review", cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
    not_recommended: { label: "Not Recommended", cls: "bg-red-50 text-red-700 border-red-200" },
  };
  const { label, cls } = map[rec] ?? { label: rec, cls: "bg-rf-ink-100 text-rf-text-muted border-rf-border" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function formatResponse(response: ScreeningResponse): string {
  const q = response.screening_questions;
  if (q.type === "yes_no") {
    if (response.value_boolean === true) return "Yes";
    if (response.value_boolean === false) return "No";
  }
  if (q.type === "number" && response.value_number != null) {
    return String(response.value_number);
  }
  if (q.type === "multiple_choice" && response.value_text && q.options) {
    const opt = q.options.find((o) => o.id === response.value_text);
    return opt?.label ?? response.value_text;
  }
  return response.value_text ?? "—";
}

// ── Main component ───────────────────────────────────────────────────────────

export function ApplicantDetailPanel({
  applicant,
  group,
  columns,
  cells,
  labelsByColumn,
  onClose,
}: {
  applicant: { id: string; full_name: string; email: string; group_id: string | null };
  group: Group | undefined;
  columns: BoardColumn[];
  cells: BoardCell[];
  labelsByColumn: Map<string, StatusLabel[]>;
  onClose: () => void;
}) {
  const appCells = cells.filter((c) => c.applicant_id === applicant.id);

  const [screening, setScreening] = useState<ScreeningSubmission | null>(null);
  const [screeningLoading, setScreeningLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setScreeningLoading(true);
    setScreening(null);

    const supabase = createClient();
    supabase
      .from("screening_submissions")
      .select(`
        id, status, ai_score, ai_summary, recommendation,
        distance_miles, drive_time_minutes, created_at, completed_at,
        screening_responses(
          id, value_text, value_number, value_boolean,
          ai_question_score, is_dealbreaker_failure,
          screening_questions(id, text, type, options, is_dealbreaker, sort_order)
        )
      `)
      .eq("applicant_id", applicant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setScreening(data as ScreeningSubmission | null);
          setScreeningLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [applicant.id]);

  const sortedResponses = screening?.screening_responses
    ? [...screening.screening_responses].sort(
        (a, b) => a.screening_questions.sort_order - b.screening_questions.sort_order
      )
    : [];

  return (
    <div className="fixed inset-0 z-[900] flex" role="dialog" aria-modal="true" aria-label={`Details for ${applicant.full_name}`}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="w-96 max-w-full bg-rf-surface-card shadow-2xl border-l border-rf-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-rf-ink-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-rf-text-primary truncate">{applicant.full_name || "Applicant"}</h2>
          <button
            onClick={onClose}
            aria-label="Close detail panel"
            className="p-1.5 rounded-lg hover:bg-rf-surface-page text-rf-text-muted hover:text-rf-ink-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stage */}
        {group && (
          <div className="px-5 py-2.5 border-b border-rf-ink-100 flex items-center gap-2 shrink-0">
            <span className="text-xs text-rf-text-muted font-medium">Stage</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: group.color }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
              {group.name}
            </span>
          </div>
        )}

        {/* Fields + Screening */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {columns.filter((col) => !col.is_hidden).map((col) => {
            const cell = appCells.find((c) => c.column_id === col.id);
            const labels = labelsByColumn.get(col.id) ?? [];

            if (col.type === "status") {
              const label = labels.find((l) => l.id === cell?.value_status_label_id);
              return (
                <div key={col.id}>
                  <p className="text-xs font-medium text-rf-text-muted mb-1">{col.name}</p>
                  {label ? (
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                      <span className="text-sm text-rf-ink-700">{label.label}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-rf-text-muted">—</span>
                  )}
                </div>
              );
            }

            let displayValue: string | null = null;
            if (col.type === "text" || col.type === "email" || col.type === "phone" || col.type === "location") {
              displayValue = cell?.value_text ?? null;
            } else if (col.type === "number") {
              displayValue = cell?.value_number != null ? String(cell.value_number) : null;
            } else if (col.type === "date") {
              displayValue = cell?.value_date ? new Date(cell.value_date).toLocaleDateString() : null;
            }

            return (
              <div key={col.id}>
                <p className="text-xs font-medium text-rf-text-muted mb-1">{col.name}</p>
                <p className="text-sm text-rf-ink-700 break-words">{displayValue ?? <span className="text-rf-text-muted">—</span>}</p>
              </div>
            );
          })}

          {/* ── Screening section ───────────────────────────────────────────── */}
          <div className="pt-2 border-t border-rf-ink-100">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-rf-text-muted" />
              <p className="text-xs font-semibold text-rf-text-primary uppercase tracking-wide">Screening</p>
            </div>

            {screeningLoading ? (
              <div className="flex items-center gap-2 text-rf-text-muted py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            ) : !screening ? (
              <p className="text-xs text-rf-text-muted">No screening sent yet.</p>
            ) : (
              <div className="space-y-3">
                {/* Status row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={screening.status} />
                  {screening.ai_score != null && <ScoreBadge score={screening.ai_score} />}
                  {screening.recommendation && <RecommendationBadge rec={screening.recommendation} />}
                </div>

                {/* Distance */}
                {(screening.distance_miles != null || screening.drive_time_minutes != null) && (
                  <p className="text-xs text-rf-text-secondary">
                    {screening.distance_miles != null && `${screening.distance_miles.toFixed(1)} mi`}
                    {screening.distance_miles != null && screening.drive_time_minutes != null && " · "}
                    {screening.drive_time_minutes != null && `${screening.drive_time_minutes} min drive`}
                  </p>
                )}

                {/* AI summary */}
                {screening.ai_summary && (
                  <div className="bg-rf-surface-page rounded-lg p-3">
                    <p className="text-xs font-medium text-rf-text-secondary mb-1">AI Summary</p>
                    <p className="text-xs text-rf-ink-700 leading-relaxed">{screening.ai_summary}</p>
                  </div>
                )}

                {/* Per-question breakdown */}
                {sortedResponses.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-rf-text-secondary">Responses</p>
                    {sortedResponses.map((resp) => (
                      <div
                        key={resp.id}
                        className={`rounded-lg p-3 text-xs border ${
                          resp.is_dealbreaker_failure
                            ? "bg-red-50 border-red-200"
                            : "bg-rf-surface-page border-rf-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="font-medium text-rf-text-primary leading-snug flex-1">
                            {resp.screening_questions.text}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {resp.is_dealbreaker_failure && (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" aria-label="Dealbreaker failure" />
                            )}
                            {resp.ai_question_score != null && (
                              <span className={`font-semibold tabular-nums ${
                                resp.ai_question_score >= 70 ? "text-green-700" :
                                resp.ai_question_score >= 40 ? "text-yellow-700" : "text-red-700"
                              }`}>
                                {resp.ai_question_score}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-rf-ink-600">{formatResponse(resp)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
