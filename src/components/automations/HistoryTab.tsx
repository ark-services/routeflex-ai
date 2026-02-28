"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, MinusCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { listJobAutomationRuns } from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";

interface Automation {
  id: string;
  name: string;
}

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
}

interface HistoryTabProps {
  companyId: string;
  jobId: string;
  automations: Automation[];
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

export function HistoryTab({ companyId, jobId, automations }: HistoryTabProps) {
  const [runs, setRuns] = useState<RunHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  useEffect(() => {
    listJobAutomationRuns(companyId, jobId, { limit: 100 })
      .then((data) => setRuns(data as RunHistoryItem[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [companyId, jobId]);

  const getAutomationName = (automationId: string) => {
    return automations.find((a) => a.id === automationId)?.name ?? "Unknown automation";
  };

  const toggleExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse flex items-start gap-3 p-3 rounded-lg bg-gray-50">
            <div className="w-4 h-4 rounded-full bg-gray-200 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-2.5 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="p-6 text-center py-16">
        <Clock className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-lg font-medium">No runs yet</p>
        <p className="text-gray-400 text-sm mt-2">
          Automation runs will appear here once automations are triggered
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <p className="text-sm text-gray-500 mb-4">
        Showing last {runs.length} runs across all automations
      </p>

      <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
        {runs.map((run) => {
          const isExpanded = expandedRuns.has(run.id);
          return (
            <div key={run.id} className="bg-rf-surface-card hover:bg-gray-50/50 transition-colors">
              <button
                onClick={() => toggleExpanded(run.id)}
                className="w-full text-left p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    {getStatusIcon(run.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium border ${getStatusColor(run.status)}`}
                        >
                          {run.status}
                        </span>
                        {run.duration_ms !== undefined && (
                          <span className="text-xs text-gray-400">{run.duration_ms}ms</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 mt-1 truncate">
                        {getAutomationName(run.automation_id)}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-400">{timeAgo(run.created_at)}</span>
                        {run.actions_attempted !== undefined && (
                          <span className="text-xs text-gray-500">
                            {run.actions_succeeded}/{run.actions_attempted} actions
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 pl-9 space-y-2">
                  {run.skip_reason && (
                    <div className="text-xs">
                      <p className="font-medium text-gray-700">Skip Reason:</p>
                      <p className="text-gray-600 mt-1 bg-gray-50 p-2 rounded">{run.skip_reason}</p>
                    </div>
                  )}

                  {run.error && (
                    <div className="text-xs">
                      <p className="font-medium text-red-700">Error:</p>
                      <p className="text-rf-danger mt-1 bg-rf-danger-bg p-2 rounded">{run.error}</p>
                    </div>
                  )}

                  {run.action_results && run.action_results.length > 0 && (
                    <div className="text-xs">
                      <p className="font-medium text-gray-700 mb-2">Actions:</p>
                      <div className="space-y-1">
                        {run.action_results.map((result: any, idx: number) => (
                          <div
                            key={idx}
                            className={`p-2 rounded text-xs ${
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
                            {result.error && <p className="mt-1 opacity-90">{result.error}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
