"use client";

import { useState } from "react";
import { MoreVertical, Power, PowerOff, Trash2, Copy, Pencil } from "lucide-react";
import {
  toggleJobAutomation,
  deleteJobAutomation,
  duplicateJobAutomation,
} from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";

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

interface ManageTabProps {
  companyId: string;
  jobId: string;
  automations: Automation[];
  triggers: Trigger[];
  onEdit: (automation: Automation) => void;
}

export function ManageTab({
  companyId,
  jobId,
  automations,
  triggers,
  onEdit,
}: ManageTabProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleToggle = async (automationId: string, currentEnabled: boolean) => {
    try {
      setActionLoading(automationId);
      await toggleJobAutomation(companyId, jobId, automationId, !currentEnabled);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (automationId: string) => {
    if (!confirm("Delete this automation? This cannot be undone.")) return;

    try {
      setActionLoading(automationId);
      await deleteJobAutomation(companyId, jobId, automationId);
      setOpenMenuId(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDuplicate = async (automationId: string) => {
    try {
      setActionLoading(automationId);
      await duplicateJobAutomation(companyId, jobId, automationId);
      setOpenMenuId(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const getTriggerName = (key: string) => {
    return triggers.find((t) => t.key === key)?.name || key;
  };

  return (
    <div className="p-6">
      {/* Search bar placeholder */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search automations..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Automations List */}
      {automations.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="mb-4">
            <svg
              className="w-16 h-16 mx-auto text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <p className="text-gray-500 text-lg font-medium">No automations yet</p>
          <p className="text-gray-400 text-sm mt-2">
            Click the "Create" tab to build your first automation recipe
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((automation) => (
            <div
              key={automation.id}
              className={`border-2 rounded-lg p-5 transition-all ${
                automation.is_enabled
                  ? "border-blue-200 bg-blue-50/30"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Recipe sentence */}
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-gray-900 font-medium text-lg">
                      {automation.name}
                    </p>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                        automation.is_enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {automation.is_enabled ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {automation.automation_actions.length} action{automation.automation_actions.length !== 1 ? 's' : ''}
                    </span>
                    <span>•</span>
                    <span>
                      Updated {new Date(automation.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  {/* Toggle */}
                  <button
                    onClick={() =>
                      handleToggle(automation.id, automation.is_enabled)
                    }
                    disabled={actionLoading === automation.id}
                    className={`p-2 rounded-lg transition-colors ${
                      automation.is_enabled
                        ? "text-green-600 hover:bg-green-100"
                        : "text-gray-400 hover:bg-gray-100"
                    } disabled:opacity-50`}
                    title={automation.is_enabled ? "Disable" : "Enable"}
                  >
                    {automation.is_enabled ? (
                      <Power className="w-5 h-5" />
                    ) : (
                      <PowerOff className="w-5 h-5" />
                    )}
                  </button>

                  {/* Kebab menu */}
                  <div className="relative">
                    <button
                      onClick={() =>
                        setOpenMenuId(
                          openMenuId === automation.id ? null : automation.id
                        )
                      }
                      disabled={actionLoading === automation.id}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <MoreVertical className="w-5 h-5 text-gray-600" />
                    </button>

                    {openMenuId === automation.id && (
                      <>
                        {/* Backdrop */}
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuId(null)}
                        />

                        {/* Menu */}
                        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                          <button
                            onClick={() => {
                              onEdit(automation);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-2.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-t-lg transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDuplicate(automation.id)}
                            className="w-full px-4 py-2.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors border-t border-gray-100"
                          >
                            <Copy className="w-4 h-4" />
                            Duplicate
                          </button>
                          <button
                            onClick={() => handleDelete(automation.id)}
                            className="w-full px-4 py-2.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 rounded-b-lg transition-colors border-t border-gray-100"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Summary */}
      {automations.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{automations.length}</p>
              <p className="text-sm text-gray-500">Total Recipes</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">
                {automations.filter((a) => a.is_enabled).length}
              </p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-400">
                {automations.filter((a) => !a.is_enabled).length}
              </p>
              <p className="text-sm text-gray-500">Inactive</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
