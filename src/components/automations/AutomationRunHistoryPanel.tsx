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
      return <CheckCircle className="w-4 h-4 text-rf-success flex-shrink-0" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-rf-danger flex-shrink-0" />;
    case "skipped":
      return <MinusCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "success":
      return "bg-rf-success-bg text-rf-success border-green-200";
    case "failed":
      return "bg-rf-danger-bg text-red-700 border-red-200";
    case "skipped":
      return "bg-gray-50 text-gray-600 border-gray-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Run History</h3>
          {!loading && (
            <p className="text-xs text-gray-500 mt-0.5">Last {runs.length} runs</p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-start gap-2 p-2 rounded-lg bg-gray-50">
                <div className="w-4 h-4 rounded-full bg-gray-200 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-2.5 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="p-6 text-center">
            <Clock className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500 font-medium">No runs yet</p>
            <p className="text-xs text-gray-400 mt-1">
              This automation hasn't been triggered
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {runs.map((run) => {
              const isExpanded = expandedRuns.has(run.id);
              return (
                <div key={run.id} className="hover:bg-gray-50/70 transition-colors">
                  <button
                    onClick={() => toggleExpanded(run.id)}
                    className="w-full text-left p-3"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {getStatusIcon(run.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${getStatusColor(run.status)}`}
                            >
                              {run.status}
                            </span>
                            {run.duration_ms !== undefined && (
                              <span className="text-xs text-gray-400">{run.duration_ms}ms</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{timeAgo(run.created_at)}</p>
                          {run.actions_attempted !== undefined && (
                            <p className="text-xs text-gray-600 mt-0.5">
                              {run.actions_succeeded}/{run.actions_attempted} actions
                            </p>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pl-9 space-y-2">
                      {run.skip_reason && (
                        <div className="text-xs">
                          <p className="font-medium text-gray-700">Skip Reason:</p>
                          <p className="text-gray-600 mt-1 bg-gray-50 p-2 rounded">
                            {run.skip_reason}
                          </p>
                        </div>
                      )}

                      {run.error && (
                        <div className="text-xs">
                          <p className="font-medium text-red-700">Error:</p>
                          <p className="text-rf-danger mt-1 bg-rf-danger-bg p-2 rounded">
                            {run.error}
                          </p>
                        </div>
                      )}

                      {run.action_results && run.action_results.length > 0 && (
                        <div className="text-xs">
                          <p className="font-medium text-gray-700 mb-1.5">Actions:</p>
                          <div className="space-y-1">
                            {run.action_results.map((result: any, idx: number) => (
                              <div
                                key={idx}
                                className={`p-2 rounded ${
                                  result.status === "success"
                                    ? "bg-rf-success-bg text-rf-success"
                                    : "bg-rf-danger-bg text-red-700"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{result.type}</span>
                                  {result.duration_ms !== undefined && (
                                    <span className="opacity-75">{result.duration_ms}ms</span>
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
                          <summary className="font-medium text-gray-700 cursor-pointer">
                            ▶ Payload
                          </summary>
                          <pre className="mt-1 bg-gray-50 p-2 rounded overflow-x-auto text-xs leading-relaxed">
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
