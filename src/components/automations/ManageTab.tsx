"use client";

import { type ReactNode, useState, useEffect } from "react";
import { MoreVertical, Trash2, Copy, Pencil } from "lucide-react";
import {
  toggleJobAutomation,
  deleteJobAutomation,
  duplicateJobAutomation,
} from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";
import { createClient } from "@/lib/supabase/client";

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

// ── Name helpers ─────────────────────────────────────────────────────────────

function condOpLabel(type: string): string {
  switch (type) {
    case "equals":        return "=";
    case "not_equals":    return "≠";
    case "contains":      return "contains";
    case "not_contains":  return "doesn't contain";
    case "status_is":     return "is";
    case "status_is_not": return "is not";
    case "is_empty":      return "is empty";
    case "is_not_empty":  return "is not empty";
    case "greater_than":  return ">";
    case "less_than":     return "<";
    default:              return type;
  }
}

/** Rebuild the automation name from stored UUIDs + current lookup maps.
 *  Falls back to the stored `automation.name` for any unresolved references. */
function buildDynamicName(
  automation: Automation,
  columnMap: Map<string, string>,
  labelMap: Map<string, string>,
  groupMap: Map<string, string>,
): string {
  const f = automation.filter ?? {};

  // ── Trigger text ────────────────────────────────────────────────────────
  let triggerText: string;
  if (automation.trigger_key === "board.status_changes_to") {
    const colName   = columnMap.get(f.column_id)  ?? null;
    const labelName = labelMap.get(f.changes_to)  ?? null;
    triggerText = colName && labelName
      ? `${colName} changes to ${labelName}`
      : `status changes to ${labelName ?? f.changes_to ?? "?"}`;
  } else if (automation.trigger_key === "applicant.moved_group") {
    const groupName = groupMap.get(f.to_group_id) ?? f.to_group_id ?? "group";
    triggerText = `applicant moved to ${groupName}`;
  } else {
    // For other trigger types keep the stored name's trigger portion if possible
    const arrowIdx = automation.name.indexOf(" → ");
    if (arrowIdx !== -1) {
      const whenPart = automation.name.slice(0, arrowIdx);
      triggerText = whenPart.startsWith("When ") ? whenPart.slice(5) : whenPart;
      // Strip any "AND only if …" suffix
      const andIdx = triggerText.indexOf(" AND only if ");
      if (andIdx !== -1) triggerText = triggerText.slice(0, andIdx);
    } else {
      triggerText = automation.trigger_key;
    }
  }

  // ── Action texts ────────────────────────────────────────────────────────
  const sortedActions = [...automation.automation_actions].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const actionTexts = sortedActions.map((action) => {
    const c = action.config ?? {};
    switch (action.type) {
      case "move_group": {
        const gName = groupMap.get(c.to_group_id) ?? "group";
        return `move to ${gName}`;
      }
      case "change_status": {
        const colName   = columnMap.get(c.column_id) ?? "status";
        const labelName = labelMap.get(c.value)      ?? c.value ?? "?";
        return `set ${colName} to ${labelName}`;
      }
      case "delete_item":
        return "delete item";
      case "set_date": {
        const colName = columnMap.get(c.column_id) ?? "date";
        return `set ${colName} to ${c.value ?? "today"}`;
      }
      case "set_number": {
        const colName = columnMap.get(c.column_id) ?? "number";
        return `set ${colName} to ${c.value ?? "?"}`;
      }
      case "inc_dec": {
        const colName = columnMap.get(c.column_id) ?? "number";
        const op = c.operation === "increment" ? "increase" : "decrease";
        return `${op} ${colName}`;
      }
      case "send_email":
        return "send email";
      case "send_slack":
        return "send Slack notification";
      case "email_gmail":
      case "send_email_gmail": {
        const colName = columnMap.get(c.recipient_column_id) ?? null;
        return colName ? `send email to ${colName}` : "send Gmail email";
      }
      case "twilio.send_sms": {
        const ts = c.toSource;
        if (ts?.type === "column") {
          const colName = columnMap.get(ts.columnId) ?? null;
          return colName ? `send SMS to ${colName}` : "send SMS";
        }
        return ts?.value ? `send SMS to ${ts.value}` : "send SMS";
      }
      case "twilio.make_call_say": {
        const ts = c.toSource;
        if (ts?.type === "column") {
          const colName = columnMap.get(ts.columnId) ?? null;
          return colName ? `call ${colName} and say` : "make call";
        }
        return ts?.value ? `call ${ts.value} and say` : "make call";
      }
      case "integration.set_field": {
        const fieldLabel = c.field_key ? c.field_key.replace(/_/g, " ") : "field";
        return `set FADV ${fieldLabel} to "${c.value ?? ""}"`;
      }
      case "fadv.add_subject":
        return "submit applicant to First Advantage";
      case "fadv.approve_order":
        return "approve FADV application (Review & Place Order)";
      case "safety_trainer.submit":
        return "submit applicant to Impact Solutions Safety Cert";
      case "lms.send_training_link":
        return "send training link to applicant";
      case "portal.send_link":
        return "send status portal link to applicant";
      case "ai.score_resume":
        return "score applicant with AI";
      default:
        return action.type;
    }
  });

  // ── Condition texts ─────────────────────────────────────────────────────
  const conditions: any[] = f.conditions ?? [];
  const conditionTexts = conditions.map((cond: any) => {
    if (cond.type === "item_in_group") {
      const gName = groupMap.get(cond.value) ?? cond.value;
      return `in group ${gName}`;
    }
    const colName = columnMap.get(cond.column_id) ?? null;
    if (!colName) return "";
    let valueDisplay = String(cond.value ?? "");
    if ((cond.type === "status_is" || cond.type === "status_is_not")) {
      valueDisplay = labelMap.get(cond.value) ?? valueDisplay;
    }
    if (cond.type === "is_empty" || cond.type === "is_not_empty") {
      return `${colName} ${condOpLabel(cond.type)}`;
    }
    return `${colName} ${condOpLabel(cond.type)} ${valueDisplay}`;
  }).filter(Boolean);

  const conditionSuffix = conditionTexts.length > 0
    ? ` AND only if ${conditionTexts.join(" AND ")}`
    : "";

  return `When ${triggerText}${conditionSuffix} → ${actionTexts.join(" and ")}`;
}

function formatRecipeName(name: string): ReactNode {
  // Pattern: "When {trigger} [AND only if {conditions}] → {actions}"
  const arrowIdx = name.indexOf(" → ");
  if (arrowIdx === -1) return name;

  const whenPart = name.slice(0, arrowIdx);
  const actionPart = name.slice(arrowIdx + 3);

  // Strip "When " prefix
  const withoutWhen = whenPart.startsWith("When ") ? whenPart.slice(5) : whenPart;

  // Check for "AND only if" conditions
  const andIdx = withoutWhen.indexOf(" AND only if ");
  const triggerText = andIdx !== -1 ? withoutWhen.slice(0, andIdx) : withoutWhen;
  const conditionText = andIdx !== -1 ? withoutWhen.slice(andIdx + 13) : null;

  return (
    <>
      <span className="text-gray-500 font-normal">When </span>
      <strong>{triggerText}</strong>
      {conditionText && (
        <>
          <span className="text-gray-500 font-normal"> AND only if </span>
          <strong>{conditionText}</strong>
        </>
      )}
      <span className="text-gray-400 font-normal"> &rarr; </span>
      <strong>{actionPart}</strong>
    </>
  );
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
  const [searchQuery, setSearchQuery] = useState("");

  // ── Live name resolution: fetch current column/label/group names ──────────
  const [columnMap, setColumnMap] = useState<Map<string, string>>(new Map());
  const [labelMap,  setLabelMap]  = useState<Map<string, string>>(new Map());
  const [groupMap,  setGroupMap]  = useState<Map<string, string>>(new Map());

  useEffect(() => {
    async function loadNameMaps() {
      const supabase = createClient();

      const { data: board } = await supabase
        .from("boards")
        .select("id")
        .eq("job_id", jobId)
        .maybeSingle();

      if (!board?.id) return;

      const [colsRes, grpsRes] = await Promise.all([
        supabase.from("board_columns").select("id, name").eq("board_id", board.id),
        supabase.from("board_groups").select("id, name").eq("board_id", board.id),
      ]);

      const colIds = (colsRes.data ?? []).map((c: any) => c.id);
      const labelsRes = colIds.length > 0
        ? await supabase
            .from("board_status_labels")
            .select("id, label")
            .in("column_id", colIds)
        : { data: [] as any[] };

      setColumnMap(new Map((colsRes.data  ?? []).map((c: any) => [c.id, c.name])));
      setGroupMap( new Map((grpsRes.data  ?? []).map((g: any) => [g.id, g.name])));
      setLabelMap( new Map((labelsRes.data ?? []).map((l: any) => [l.id, l.label])));
    }

    loadNameMaps();
  }, [jobId]);

  const nameReady = columnMap.size > 0 || labelMap.size > 0 || groupMap.size > 0;

  /** Returns the best display name for an automation. */
  const getDisplayName = (automation: Automation): string => {
    if (!nameReady) return automation.name;
    return buildDynamicName(automation, columnMap, labelMap, groupMap);
  };

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

  // Filter automations by search query (search against live display name)
  const filteredAutomations = automations.filter((automation) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const displayName = getDisplayName(automation).toLowerCase();
    const triggerMatch = automation.trigger_key.toLowerCase().includes(query);
    const triggerNameMatch = getTriggerName(automation.trigger_key).toLowerCase().includes(query);

    // Also search action types
    const actionTypeMatch = automation.automation_actions.some((action) =>
      action.type.toLowerCase().includes(query)
    );

    // Search in action type labels (human-readable)
    const actionLabelMatch = automation.automation_actions.some((action) => {
      const labelMap: Record<string, string> = {
        'move_group':           'move to group',
        'set_status':           'set status',
        'change_status':        'change status',
        'delete_item':          'delete item',
        'set_date':             'set date',
        'set_number':           'set number',
        'inc_dec':              'increment decrement',
        'webhook':              'webhook',
        'send_email':           'send email',
        'send_slack':           'send slack',
        'email_gmail':          'send gmail email',
        'send_email_gmail':     'send email gmail',
        'twilio.send_sms':      'send sms',
        'twilio.make_call_say': 'make call',
        'integration.set_field':    'set fadv field',
        'fadv.add_subject':         'add to fadv',
        'fadv.approve_order':       'approve fadv order',
        'safety_trainer.submit':    'impact solutions safety cert',
        'lms.send_training_link':   'send training link',
        'portal.send_link':         'send status portal link',
        'ai.score_resume':          'ai score resume',
      };
      return (labelMap[action.type] || action.type).includes(query);
    });

    return displayName.includes(query) || triggerMatch || triggerNameMatch || actionTypeMatch || actionLabelMatch;
  });

  return (
    <div className="p-6">
      {/* Search bar */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search automations by name or trigger..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rf-blue"
        />
        {searchQuery && (
          <p className="text-xs text-gray-500 mt-1">
            Showing {filteredAutomations.length} of {automations.length} automations
          </p>
        )}
      </div>

      {/* Automations List */}
      {filteredAutomations.length === 0 ? (
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
          <p className="text-gray-500 text-lg font-medium">
            {searchQuery ? 'No matching automations' : 'No automations yet'}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {searchQuery
              ? 'Try a different search term'
              : 'Click the "Create" tab to build your first automation recipe'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAutomations.map((automation) => (
            <div
              key={automation.id}
              onClick={() => onEdit(automation)}
              className={`border-2 rounded-lg p-5 transition-all cursor-pointer group ${
                automation.is_enabled
                  ? "border-rf-blue-tint bg-rf-blue-tint/30 hover:border-rf-blue hover:bg-rf-blue-tint/50"
                  : "border-gray-200 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Recipe sentence — rendered from live column/label/group names */}
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-gray-900 text-lg">
                      {formatRecipeName(getDisplayName(automation))}
                    </p>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                        automation.is_enabled
                          ? "bg-rf-success-bg text-rf-success"
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
                  {/* Toggle switch */}
                  <button
                    role="switch"
                    aria-checked={automation.is_enabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(automation.id, automation.is_enabled);
                    }}
                    disabled={actionLoading === automation.id}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue focus-visible:ring-offset-2 disabled:opacity-50 ${
                      automation.is_enabled ? "bg-rf-success" : "bg-rf-ink-300"
                    }`}
                    title={automation.is_enabled ? "Disable" : "Enable"}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-rf-surface-card shadow transition-transform ${
                        automation.is_enabled ? "translate-x-4" : "translate-x-1"
                      }`}
                    />
                  </button>

                  {/* Kebab menu */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
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
                        <div className="absolute right-0 mt-1 w-48 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg z-20">
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
                            className="w-full px-4 py-2.5 text-left text-rf-danger hover:bg-rf-danger-bg flex items-center gap-2 rounded-b-lg transition-colors border-t border-gray-100"
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
              <p className="text-2xl font-bold text-rf-success">
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
