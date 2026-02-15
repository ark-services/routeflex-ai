"use client";

import { useState } from "react";
import { Search, Plus, X, ChevronDown } from "lucide-react";
import { createJobAutomation } from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";

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

interface Action {
  type: "move_group" | "set_status" | "webhook" | "send_email";
  config: Record<string, any>;
}

interface CreateTabProps {
  companyId: string;
  jobId: string;
  triggers: Trigger[];
  groups: Group[];
  onCreated: () => void;
}

export function CreateTab({
  companyId,
  jobId,
  triggers,
  groups,
  onCreated,
}: CreateTabProps) {
  const [selectedTrigger, setSelectedTrigger] = useState<Trigger | null>(null);
  const [triggerSearchOpen, setTriggerSearchOpen] = useState(false);
  const [triggerSearch, setTriggerSearch] = useState("");
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter config (contextual based on trigger)
  const [filterConfig, setFilterConfig] = useState<Record<string, any>>({});

  const filteredTriggers = triggers.filter((t) =>
    t.name.toLowerCase().includes(triggerSearch.toLowerCase()) ||
    t.key.toLowerCase().includes(triggerSearch.toLowerCase())
  );

  const addAction = () => {
    if (actions.length >= 3) {
      alert("Maximum 3 actions per automation");
      return;
    }

    setActions([
      ...actions,
      { type: "move_group", config: {} },
    ]);
  };

  const updateAction = (index: number, updates: Partial<Action>) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    setActions(newActions);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!selectedTrigger) {
      alert("Please select a trigger");
      return;
    }

    if (actions.length === 0) {
      alert("Please add at least one action");
      return;
    }

    // Validate actions
    for (const action of actions) {
      if (action.type === "move_group" && !action.config.to_group_id) {
        alert("Please select a target group for 'Move to group' action");
        return;
      }
      if (action.type === "set_status" && !action.config.status) {
        alert("Please select a status for 'Set status' action");
        return;
      }
      if (action.type === "webhook" && !action.config.url) {
        alert("Please enter a webhook URL");
        return;
      }
      if (action.type === "send_email" && (!action.config.subject || !action.config.body)) {
        alert("Please enter email subject and body");
        return;
      }
    }

    setLoading(true);
    try {
      // Build automation name from recipe
      const name = buildRecipeName();

      await createJobAutomation(companyId, jobId, {
        name,
        trigger_key: selectedTrigger.key,
        filter: filterConfig,
        actions: actions.map((action, index) => ({
          ...action,
          sort_order: index,
        })),
      });

      // Reset form
      setSelectedTrigger(null);
      setFilterConfig({});
      setActions([]);
      onCreated();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const buildRecipeName = () => {
    if (!selectedTrigger) return "";

    const actionSummary = actions
      .map((action) => {
        switch (action.type) {
          case "move_group":
            return "move to group";
          case "set_status":
            return `set status to ${action.config.status || "..."}`;
          case "webhook":
            return "send webhook";
          case "send_email":
            return "send email";
          default:
            return action.type;
        }
      })
      .join(" and ");

    return `When ${selectedTrigger.name.toLowerCase()}, then ${actionSummary}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Recipe Sentence Preview */}
      {selectedTrigger && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium mb-1">Recipe Preview:</p>
          <p className="text-gray-900">{buildRecipeName()}</p>
        </div>
      )}

      {/* When this happens */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          When this happens...
        </label>

        {!selectedTrigger ? (
          <div className="relative">
            <button
              onClick={() => setTriggerSearchOpen(!triggerSearchOpen)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-left flex items-center justify-between hover:border-gray-400 transition-colors"
            >
              <span className="text-gray-500">Select a trigger</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {triggerSearchOpen && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                {/* Search */}
                <div className="sticky top-0 bg-white border-b border-gray-200 p-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={triggerSearch}
                      onChange={(e) => setTriggerSearch(e.target.value)}
                      placeholder="Search triggers..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Trigger list */}
                <div className="p-2">
                  {filteredTriggers.map((trigger) => (
                    <button
                      key={trigger.id}
                      onClick={() => {
                        setSelectedTrigger(trigger);
                        setTriggerSearchOpen(false);
                        setTriggerSearch("");
                      }}
                      className="w-full px-3 py-2 text-left rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <p className="font-medium text-gray-900">{trigger.name}</p>
                      {trigger.description && (
                        <p className="text-sm text-gray-500 mt-0.5">
                          {trigger.description}
                        </p>
                      )}
                    </button>
                  ))}

                  {filteredTriggers.length === 0 && (
                    <p className="text-center text-gray-500 py-4">
                      No triggers found
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{selectedTrigger.name}</p>
              {selectedTrigger.description && (
                <p className="text-sm text-gray-600 mt-0.5">
                  {selectedTrigger.description}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedTrigger(null);
                setFilterConfig({});
              }}
              className="p-1 hover:bg-blue-100 rounded"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}

        {/* Contextual filter options */}
        {selectedTrigger && selectedTrigger.key === "applicant.moved_group" && (
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              Filter by group (optional):
            </label>
            <select
              value={filterConfig.to_group_id || ""}
              onChange={(e) =>
                setFilterConfig({
                  ...filterConfig,
                  to_group_id: e.target.value || undefined,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Any group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedTrigger && selectedTrigger.key === "applicant.status_changed" && (
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              Filter by status (optional):
            </label>
            <select
              value={filterConfig.to_status || ""}
              onChange={(e) =>
                setFilterConfig({
                  ...filterConfig,
                  to_status: e.target.value || undefined,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Any status</option>
              <option value="applied">Applied</option>
              <option value="screening">Screening</option>
              <option value="first_advantage">First Advantage</option>
              <option value="interviewing">Interviewing</option>
              <option value="tsa">TSA</option>
              <option value="hr_paperwork">HR Paperwork</option>
              <option value="hired">Hired</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        )}
      </div>

      {/* Then do this */}
      {selectedTrigger && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            Then do this...
          </label>

          <div className="space-y-3">
            {actions.map((action, index) => (
              <div
                key={index}
                className="border border-gray-300 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    Action {index + 1}
                  </span>
                  <button
                    onClick={() => removeAction(index)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-600" />
                  </button>
                </div>

                {/* Action type selector */}
                <select
                  value={action.type}
                  onChange={(e) =>
                    updateAction(index, {
                      type: e.target.value as any,
                      config: {},
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="move_group">Move to group</option>
                  <option value="set_status">Set status</option>
                  <option value="webhook">Send webhook</option>
                  <option value="send_email">Send email</option>
                </select>

                {/* Action config */}
                {action.type === "move_group" && (
                  <select
                    value={action.config.to_group_id || ""}
                    onChange={(e) =>
                      updateAction(index, {
                        config: { to_group_id: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select target group...</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                )}

                {action.type === "set_status" && (
                  <select
                    value={action.config.status || ""}
                    onChange={(e) =>
                      updateAction(index, {
                        config: { status: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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

                {action.type === "webhook" && (
                  <div className="space-y-2">
                    <input
                      type="url"
                      value={action.config.url || ""}
                      onChange={(e) =>
                        updateAction(index, {
                          config: { ...action.config, url: e.target.value },
                        })
                      }
                      placeholder="https://example.com/webhook"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <select
                      value={action.config.method || "POST"}
                      onChange={(e) =>
                        updateAction(index, {
                          config: { ...action.config, method: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                    </select>
                  </div>
                )}

                {action.type === "send_email" && (
                  <div className="space-y-2">
                    <select
                      value={action.config.to || "applicant"}
                      onChange={(e) =>
                        updateAction(index, {
                          config: { ...action.config, to: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="applicant">To: Applicant</option>
                    </select>
                    <input
                      type="text"
                      value={action.config.subject || ""}
                      onChange={(e) =>
                        updateAction(index, {
                          config: { ...action.config, subject: e.target.value },
                        })
                      }
                      placeholder="Email subject"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <textarea
                      value={action.config.body || ""}
                      onChange={(e) =>
                        updateAction(index, {
                          config: { ...action.config, body: e.target.value },
                        })
                      }
                      placeholder="Email body (use {{applicant_id}} for variables)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows={3}
                    />
                  </div>
                )}
              </div>
            ))}

            {actions.length < 3 && (
              <button
                onClick={addAction}
                className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add action
              </button>
            )}
          </div>
        </div>
      )}

      {/* Create button */}
      {selectedTrigger && actions.length > 0 && (
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create automation"}
          </button>
        </div>
      )}
    </div>
  );
}
