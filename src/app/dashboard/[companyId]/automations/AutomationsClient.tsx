"use client";

import { useState } from "react";
import {
  toggleAutomation,
  deleteAutomation,
  createAutomation,
  testFireAutomation,
} from "./actions";

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
  board_id: string;
}

export function AutomationsClient({
  companyId,
  automations,
  triggers,
  groups,
}: {
  companyId: string;
  automations: Automation[];
  triggers: Trigger[];
  groups: Group[];
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleToggle = async (automationId: string, isEnabled: boolean) => {
    try {
      await toggleAutomation(companyId, automationId, !isEnabled);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (automationId: string) => {
    if (!confirm("Delete this automation?")) return;

    try {
      await deleteAutomation(companyId, automationId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <>
      <div className="mb-6">
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-rf-blue text-white rounded hover:bg-rf-blue-dark"
        >
          + Create Automation
        </button>
      </div>

      {/* Automations List */}
      <div className="space-y-4">
        {automations.length === 0 && (
          <div className="bg-rf-surface-card rounded-lg border border-rf-border p-8 text-center text-rf-text-muted">
            No automations yet. Create one to get started.
          </div>
        )}

        {automations.map((automation) => (
          <div
            key={automation.id}
            className="bg-rf-surface-card rounded-lg border border-rf-border p-6"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-rf-ink-900">
                    {automation.name}
                  </h3>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      automation.is_enabled
                        ? "bg-rf-success-bg text-rf-success"
                        : "bg-rf-ink-100 text-rf-ink-900"
                    }`}
                  >
                    {automation.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>

                <p className="text-sm text-rf-text-secondary mt-1">
                  Trigger: <span className="font-mono">{automation.trigger_key}</span>
                </p>

                {automation.automation_actions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-rf-text-muted uppercase tracking-wide mb-2">
                      Actions
                    </p>
                    <div className="space-y-1">
                      {automation.automation_actions
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((action) => (
                          <div
                            key={action.id}
                            className="text-sm text-rf-ink-700 flex items-center gap-2"
                          >
                            <span className="text-rf-text-muted">→</span>
                            <span className="font-medium">{action.type}</span>
                            <span className="text-rf-text-muted font-mono text-xs">
                              {JSON.stringify(action.config)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    handleToggle(automation.id, automation.is_enabled)
                  }
                  className="px-3 py-1 text-sm border border-rf-border rounded hover:bg-rf-surface-page"
                >
                  {automation.is_enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => handleDelete(automation.id)}
                  className="px-3 py-1 text-sm border border-red-300 text-red-700 rounded hover:bg-rf-danger-bg"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAutomationModal
          companyId={companyId}
          triggers={triggers}
          groups={groups}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  );
}

function CreateAutomationModal({
  companyId,
  triggers,
  groups,
  onClose,
}: {
  companyId: string;
  triggers: Trigger[];
  groups: Group[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [triggerKey, setTriggerKey] = useState("");
  const [actionType, setActionType] = useState<
    "move_group" | "set_status" | "webhook" | "send_email"
  >("move_group");
  const [actionConfig, setActionConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !triggerKey) return;

    setLoading(true);
    try {
      await createAutomation(companyId, {
        name,
        trigger_key: triggerKey,
        actions: [
          {
            type: actionType,
            config: actionConfig,
          },
        ],
      });
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-rf-surface-card rounded-lg max-w-2xl w-full p-6">
        <h2 className="text-2xl font-bold mb-4">Create Automation</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-rf-ink-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-rf-border rounded"
              placeholder="e.g. Move new applicants to screening"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-rf-ink-700 mb-1">
              Trigger
            </label>
            <select
              value={triggerKey}
              onChange={(e) => setTriggerKey(e.target.value)}
              className="w-full px-3 py-2 border border-rf-border rounded"
              required
            >
              <option value="">Select a trigger...</option>
              {triggers.map((trigger) => (
                <option key={trigger.key} value={trigger.key}>
                  {trigger.name} ({trigger.key})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-rf-ink-700 mb-1">
              Action Type
            </label>
            <select
              value={actionType}
              onChange={(e) =>
                setActionType(
                  e.target.value as
                    | "move_group"
                    | "set_status"
                    | "webhook"
                    | "send_email"
                )
              }
              className="w-full px-3 py-2 border border-rf-border rounded"
            >
              <option value="move_group">Move to Group</option>
              <option value="set_status">Set Status</option>
              <option value="webhook">Webhook</option>
              <option value="send_email">Send Email (stub)</option>
            </select>
          </div>

          {/* Action Config */}
          <div>
            <label className="block text-sm font-medium text-rf-ink-700 mb-1">
              Action Configuration
            </label>

            {actionType === "move_group" && (
              <select
                value={actionConfig.to_group_id || ""}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, to_group_id: e.target.value })
                }
                className="w-full px-3 py-2 border border-rf-border rounded"
                required
              >
                <option value="">Select target group...</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            )}

            {actionType === "set_status" && (
              <select
                value={actionConfig.status || ""}
                onChange={(e) =>
                  setActionConfig({ ...actionConfig, status: e.target.value })
                }
                className="w-full px-3 py-2 border border-rf-border rounded"
                required
              >
                <option value="">Select status...</option>
                <option value="applied">Applied</option>
                <option value="screening">Screening</option>
                <option value="first_advantage">First Advantage</option>
                <option value="interviewing">Interviewing</option>
                <option value="tsa">TSA</option>
                <option value="hr_paperwork">HR Paperwork</option>
                <option value="hired">Hired</option>
                <option value="rejected">Rejected</option>
              </select>
            )}

            {actionType === "webhook" && (
              <div className="space-y-2">
                <input
                  type="url"
                  value={actionConfig.url || ""}
                  onChange={(e) =>
                    setActionConfig({ ...actionConfig, url: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-rf-border rounded"
                  placeholder="https://example.com/webhook"
                  required
                />
              </div>
            )}

            {actionType === "send_email" && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={actionConfig.subject || ""}
                  onChange={(e) =>
                    setActionConfig({ ...actionConfig, subject: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-rf-border rounded"
                  placeholder="Email subject"
                  required
                />
                <textarea
                  value={actionConfig.body || ""}
                  onChange={(e) =>
                    setActionConfig({ ...actionConfig, body: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-rf-border rounded"
                  placeholder="Email body"
                  rows={4}
                  required
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-rf-blue text-white rounded hover:bg-rf-blue-dark disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-rf-border rounded hover:bg-rf-surface-page"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
