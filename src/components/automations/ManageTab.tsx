"use client";

import { useState } from "react";
import { MoreVertical, Power, PowerOff, Trash2 } from "lucide-react";
import {
  toggleJobAutomation,
  deleteJobAutomation,
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
}

export function ManageTab({
  companyId,
  jobId,
  automations,
  triggers,
}: ManageTabProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleToggle = async (automationId: string, currentEnabled: boolean) => {
    try {
      await toggleJobAutomation(companyId, jobId, automationId, !currentEnabled);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (automationId: string) => {
    if (!confirm("Delete this automation? This cannot be undone.")) return;

    try {
      await deleteJobAutomation(companyId, jobId, automationId);
      setOpenMenuId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getTriggerName = (key: string) => {
    return triggers.find((t) => t.key === key)?.name || key;
  };

  const buildRecipeSentence = (automation: Automation) => {
    const triggerName = getTriggerName(automation.trigger_key);
    const actions = automation.automation_actions
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((action) => {
        switch (action.type) {
          case "move_group":
            return "move to group";
          case "set_status":
            return `set status to ${action.config.status}`;
          case "webhook":
            return "send webhook";
          case "send_email":
            return "send email";
          default:
            return action.type;
        }
      });

    return `When ${triggerName.toLowerCase()}, then ${actions.join(" and ")}`;
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
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No automations yet</p>
          <p className="text-gray-400 text-sm mt-2">
            Click the "Create" tab to build your first automation
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((automation) => (
            <div
              key={automation.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Recipe sentence */}
                  <div className="flex items-center gap-3">
                    <p className="text-gray-900 font-medium">
                      {buildRecipeSentence(automation)}
                    </p>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        automation.is_enabled
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {automation.is_enabled ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>{automation.automation_actions.length} actions</span>
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
                    className={`p-2 rounded-lg transition-colors ${
                      automation.is_enabled
                        ? "text-green-600 hover:bg-green-50"
                        : "text-gray-400 hover:bg-gray-50"
                    }`}
                    title={automation.is_enabled ? "Disable" : "Enable"}
                  >
                    {automation.is_enabled ? (
                      <Power className="w-4 h-4" />
                    ) : (
                      <PowerOff className="w-4 h-4" />
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
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-600" />
                    </button>

                    {openMenuId === automation.id && (
                      <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                        <button
                          onClick={() => handleDelete(automation.id)}
                          className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
