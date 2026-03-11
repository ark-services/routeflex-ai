"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, MinusCircle, Clock, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { listJobAutomationRuns } from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";

interface RunHistoryItem {
  id: string;
  automation_id: string;
  status: string;
  error?: string;
  skip_reason?: string;
  created_at: string;
  actions_attempted?: number;
  actions_succeeded?: number;
  actions_failed?: number;
  duration_ms?: number;
  action_results?: any[];
  payload?: any;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "success":
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />;
    case "failed":
      return <XCircle className="w-3.5 h-3.5 text-rf-danger flex-shrink-0" />;
    case "skipped":
      return <MinusCircle className="w-3.5 h-3.5 text-rf-ink-300 flex-shrink-0" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-rf-ink-300 flex-shrink-0" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "success":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "failed":
      return "bg-red-50 text-red-700 ring-1 ring-red-200";
    case "skipped":
      return "bg-rf-surface-page text-rf-ink-500 ring-1 ring-rf-ink-100";
    default:
      return "bg-rf-surface-page text-rf-ink-500 ring-1 ring-rf-ink-100";
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface AutomationRunHistoryPanelProps {
  companyId: string;
  jobId: string;
  automationId: string;
  /** Increment to force a refresh (e.g. after saving the automation) */
  refreshKey?: number;
}

export function AutomationRunHistoryPanel({
  companyId,
  jobId,
  automationId,
  refreshKey = 0,
}: AutomationRunHistoryPanelProps) {
  const [runs, setRuns] = useState<RunHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  async function load() {
    try {
      setLoading(true);
      const data = await listJobAutomationRuns(companyId, jobId, {
        limit: 50,
        automationId,
      });
      setRuns(data as RunHistoryItem[]);
    } catch (err) {
      console.error("[AutomationRunHistoryPanel] Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, jobId, automationId, refreshKey]);

  const toggleExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-rf-surface-page/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-rf-border flex-shrink-0 bg-rf-surface-card">
        <div>
          <h3 className="text-sm font-bold text-rf-ink-900">Run History</h3>
          {!loading && (
            <p className="text-[11px] text-rf-ink-300 mt-0.5 tabular-nums">
              Last {runs.length} runs
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 hover:bg-rf-surface-page rounded-rf-sm transition-colors text-rf-ink-300 hover:text-rf-ink-700 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse p-3 rounded-rf-md bg-rf-surface-card">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-rf-ink-100 flex-shrink-0" />
                  <div className="h-3 bg-rf-ink-100 rounded w-16" />
                  <div className="h-2.5 bg-rf-ink-100 rounded w-10 ml-auto" />
                </div>
                <div className="mt-2 flex items-center gap-2 pl-5.5">
                  <div className="h-2.5 bg-rf-ink-100 rounded w-12" />
                  <div className="h-2.5 bg-rf-ink-100 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rf-surface-card shadow-rf-sm">
              <Clock className="w-5 h-5 text-rf-ink-300" />
            </div>
            <p className="text-sm font-semibold text-rf-ink-700">No runs yet</p>
            <p className="text-xs text-rf-ink-300 mt-0.5">
              This automation hasn&apos;t been triggered
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {runs.map((run) => {
              const isExpanded = expandedRuns.has(run.id);
              return (
                <div
                  key={run.id}
                  className={`rounded-rf-md bg-rf-surface-card transition-all ${
                    isExpanded ? "shadow-rf-sm ring-1 ring-rf-border" : "hover:shadow-rf-sm"
                  }`}
                >
                  <button
                    onClick={() => toggleExpanded(run.id)}
                    className="w-full text-left px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {getStatusIcon(run.status)}
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${getStatusBadge(run.status)}`}
                        >
                          {run.status}
                        </span>
                        {run.duration_ms !== undefined && (
                          <span className="text-[11px] text-rf-ink-300 tabular-nums">{run.duration_ms}ms</span>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-rf-ink-300 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-rf-ink-300 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 pl-[22px]">
                      <span className="text-[11px] text-rf-ink-300 tabular-nums">{timeAgo(run.created_at)}</span>
                      {run.actions_attempted !== undefined && (
                        <span className="text-[11px] text-rf-ink-300 tabular-nums">
                          {run.actions_succeeded}/{run.actions_attempted} actions
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pl-[22px] space-y-2 border-t border-rf-border/50 pt-2 mx-3">
                      {run.skip_reason && (
                        <div className="text-xs">
                          <p className="font-semibold text-rf-ink-700 text-[11px] mb-1">Skip Reason</p>
                          <p className="text-rf-ink-500 bg-rf-surface-page p-2 rounded-rf-sm text-[12px] leading-relaxed">
                            {run.skip_reason}
                          </p>
                        </div>
                      )}

                      {run.error && (
                        <div className="text-xs">
                          <p className="font-semibold text-red-700 text-[11px] mb-1">Error</p>
                          <p className="text-red-600 bg-red-50 p-2 rounded-rf-sm text-[12px] leading-relaxed">
                            {run.error}
                          </p>
                        </div>
                      )}

                      {run.action_results && run.action_results.length > 0 && (
                        <div className="text-xs">
                          <p className="font-semibold text-rf-ink-700 text-[11px] mb-1.5">Actions</p>
                          <div className="space-y-1">
                            {run.action_results.map((result: any, idx: number) => (
                              <div
                                key={idx}
                                className={`p-2 rounded-rf-sm text-[12px] ${
                                  result.status === "success"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{result.type}</span>
                                  {result.duration_ms !== undefined && (
                                    <span className="opacity-70 tabular-nums">{result.duration_ms}ms</span>
                                  )}
                                </div>
                                {result.error && (
                                  <p className="mt-1 opacity-90">{result.error}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {run.payload && (
                        <details className="text-xs">
                          <summary className="font-semibold text-rf-ink-700 cursor-pointer text-[11px]">
                            Payload
                          </summary>
                          <pre className="mt-1 bg-rf-surface-page p-2 rounded-rf-sm overflow-x-auto text-[11px] leading-relaxed text-rf-ink-500">
                            {JSON.stringify(run.payload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
