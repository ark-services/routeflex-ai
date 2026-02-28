"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, MinusCircle } from "lucide-react";
import { CreateTab } from "@/components/automations/CreateTab";
import { getAutomationRunHistory, getAutomationRunDetails } from "./actions";

interface Automation {
  id: string;
  name: string;
  is_enabled: boolean;
  trigger_key: string;
  filter: any;
  created_at: string;
  updated_at: string;
  automation_actions: Array<{
    id: string;
    type: string;
    config: any;
    sort_order: number;
  }>;
}

interface Trigger {
  id: string;
  key: string;
  name: string;
  description: string;
}

interface Group {
  id: string;
  name: string;
  color: string;
}

interface RunHistoryItem {
  id: string;
  status: 'success' | 'failed' | 'skipped';
  created_at: string;
  error?: string;
  skip_reason?: string;
  actions_attempted?: number;
  actions_succeeded?: number;
  actions_failed?: number;
  duration_ms?: number;
  payload?: any;
  action_results?: any[];
}

export function EditAutomationClient({
  companyId,
  jobId,
  accountId,
  automation,
  triggers,
  groups,
}: {
  companyId: string;
  jobId: string;
  accountId: string;
  automation: Automation;
  triggers: Trigger[];
  groups: Group[];
}) {
  const router = useRouter();
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([]);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRunHistory();
  }, [automation.id]);

  async function loadRunHistory() {
    try {
      setLoading(true);
      const runs = await getAutomationRunHistory(companyId, jobId, automation.id);
      setRunHistory(runs);
    } catch (err) {
      console.error('Failed to load run history:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleRunExpanded(runId: string) {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-rf-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-rf-danger" />;
      case 'skipped':
        return <MinusCircle className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'success':
        return 'bg-rf-success-bg text-rf-success border-green-200';
      case 'failed':
        return 'bg-rf-danger-bg text-red-700 border-red-200';
      case 'skipped':
        return 'bg-gray-50 text-gray-600 border-gray-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  }

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      {/* Main Content: Automation Editor (Left on desktop) */}
      <div className="flex-1 flex flex-col overflow-hidden order-2 lg:order-1">
        {/* Header */}
        <div className="bg-rf-surface-card border-b border-gray-200 px-6 py-4">
          <button
            onClick={() => router.push(`/dashboard/${companyId}/jobs/${jobId}/applicants`)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Board
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">
            Edit Automation
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {automation.name}
          </p>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto bg-rf-surface-card">
          <CreateTab
            companyId={companyId}
            jobId={jobId}
            accountId={accountId}
            triggers={triggers}
            groups={groups}
            editingAutomation={automation}
            onCreated={() => {
              // Refresh run history after save
              loadRunHistory();
              router.push(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
            }}
            onCancelEdit={() => {
              router.push(`/dashboard/${companyId}/jobs/${jobId}/applicants`);
            }}
          />
        </div>
      </div>

      {/* Right Sidebar: Run History (Hidden on mobile by default) */}
      <div className="w-full lg:w-96 bg-rf-surface-card border-l border-gray-200 flex flex-col order-1 lg:order-2 max-h-[50vh] lg:max-h-none">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Run History</h3>
            <p className="text-xs text-gray-500 mt-1">
              Last {runHistory.length} runs
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">
              Loading...
            </div>
          ) : runHistory.length === 0 ? (
            <div className="p-4 text-center">
              <Clock className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No runs yet</p>
              <p className="text-xs text-gray-400 mt-1">
                This automation hasn't been triggered
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {runHistory.map((run) => {
                const isExpanded = expandedRuns.has(run.id);
                return (
                  <div key={run.id} className="p-3 hover:bg-gray-50">
                    <button
                      onClick={() => toggleRunExpanded(run.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          {getStatusIcon(run.status)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium border ${getStatusColor(
                                  run.status
                                )}`}
                              >
                                {run.status}
                              </span>
                              {run.duration_ms !== undefined && (
                                <span className="text-xs text-gray-500">
                                  {run.duration_ms}ms
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(run.created_at).toLocaleString()}
                            </p>
                            {run.actions_attempted !== undefined && (
                              <p className="text-xs text-gray-600 mt-1">
                                {run.actions_succeeded}/{run.actions_attempted} actions
                              </p>
                            )}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 pl-6 space-y-2">
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
                            <p className="font-medium text-gray-700 mb-2">Actions:</p>
                            <div className="space-y-1">
                              {run.action_results.map((result: any, idx: number) => (
                                <div
                                  key={idx}
                                  className={`p-2 rounded text-xs ${
                                    result.status === 'success'
                                      ? 'bg-rf-success-bg text-rf-success'
                                      : 'bg-rf-danger-bg text-red-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">{result.type}</span>
                                    <span className="text-xs opacity-75">
                                      {result.duration_ms}ms
                                    </span>
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
                              Payload
                            </summary>
                            <pre className="mt-1 bg-gray-50 p-2 rounded overflow-x-auto text-xs">
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
    </div>
  );
}
