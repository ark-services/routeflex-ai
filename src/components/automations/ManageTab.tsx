"use client";

import { type ReactNode, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, Copy, Pencil, ChevronDown, ChevronRight, Plus, Check, X, UserRound, ArrowRight, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  toggleJobAutomation,
  deleteJobAutomation,
  duplicateJobAutomation,
  createJobAutomationAgent,
  updateJobAutomationAgent,
  toggleJobAutomationAgent,
  deleteJobAutomationAgent,
  assignAutomationToAgent,
  reorderJobAutomationAgents,
} from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";
import type { AutomationAgent } from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";
import { createClient } from "@/lib/supabase/client";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";

interface Automation {
  id: string;
  name: string;
  is_enabled: boolean;
  trigger_key: string;
  filter: any;
  created_at: string;
  updated_at: string;
  agent_id?: string | null;
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
  agents: AutomationAgent[];
  onEdit: (automation: Automation) => void;
  onAddTaskForAgent?: (agentId: string) => void;
}

// ── Sortable wrapper for agent group rows ────────────────────────────────────
function SortableAgentGroupItem({
  id,
  isDraggable,
  className,
  children,
}: {
  id: string;
  isDraggable: boolean;
  className?: string;
  children: (dragHandleProps: React.HTMLAttributes<HTMLElement>) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDraggable });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={className}
    >
      {children(isDraggable ? { ...attributes, ...listeners } : {})}
    </div>
  );
}

// ── Emoji presets for agent creation ─────────────────────────────────────────
const AGENT_EMOJIS = ["👤", "👥", "💬", "📞", "📧", "✉️", "📨", "🔔", "📝", "📅", "🤝", "🏷️", "🔍", "✅", "⭐"];

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
      case "screening.send_link":
        return "send screening questionnaire link to applicant";
      case "ai.score_resume":
        return "score applicant with AI";
      case "esign.send_agreement":
        return "send eSign agreement via Adobe Sign";
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
      <span className="text-rf-text-muted font-normal">When </span>
      <strong>{triggerText}</strong>
      {conditionText && (
        <>
          <span className="text-rf-text-muted font-normal"> AND only if </span>
          <strong>{conditionText}</strong>
        </>
      )}
      <span className="text-rf-text-muted font-normal"> &rarr; </span>
      <strong>{actionPart}</strong>
    </>
  );
}

export function ManageTab({
  companyId,
  jobId,
  automations,
  triggers,
  agents,
  onEdit,
  onAddTaskForAgent,
}: ManageTabProps) {
  const confirm = useConfirmDialog();
  const toast = useToast();
  const router = useRouter();
  // Local automations state for optimistic updates (e.g. move-to-agent)
  const [localAutomations, setLocalAutomations] = useState(automations);
  useEffect(() => { setLocalAutomations(automations); }, [automations]);

  // Local agents state for optimistic drag-to-reorder
  const [localAgents, setLocalAgents] = useState(agents);
  useEffect(() => { setLocalAgents(agents); }, [agents]);

  // DnD sensors — require 8px movement before activating (prevents accidental drags)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleAgentDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localAgents.findIndex((a) => a.id === active.id);
    const newIndex = localAgents.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(localAgents, oldIndex, newIndex);
    setLocalAgents(reordered);
    try {
      await reorderJobAutomationAgents(companyId, jobId, reordered.map((a) => a.id));
    } catch (err: any) {
      setLocalAgents(localAgents); // revert on error
      toast.error(err.message);
    }
  };
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const collapsedStorageKey = `agents-collapsed-${jobId}`;
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(`agents-collapsed-${jobId}`);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentEmoji, setNewAgentEmoji] = useState("👤");
  const [newAgentDescription, setNewAgentDescription] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingAgentName, setEditingAgentName] = useState("");
  const [editingAgentDescription, setEditingAgentDescription] = useState("");
  const [editingAgentEmoji, setEditingAgentEmoji] = useState("👤");
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false);
  // "Move to agent" submenu
  const [moveMenuAutomationId, setMoveMenuAutomationId] = useState<string | null>(null);

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
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (automationId: string) => {
    const ok = await confirm({
      title: "Delete Automation",
      description: "This will permanently delete this automation. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      setActionLoading(automationId);
      await deleteJobAutomation(companyId, jobId, automationId);
      setOpenMenuId(null);
    } catch (err: any) {
      toast.error(err.message);
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
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMoveToAgent = async (automationId: string, agentId: string | null) => {
    try {
      setActionLoading(automationId);
      // Optimistic update
      setLocalAutomations(prev =>
        prev.map(a => a.id === automationId ? { ...a, agent_id: agentId } : a)
      );
      await assignAutomationToAgent(companyId, jobId, automationId, agentId);
      setOpenMenuId(null);
      setMoveMenuAutomationId(null);
      router.refresh();
    } catch (err: any) {
      // Revert on error
      setLocalAutomations(automations);
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const getTriggerName = (key: string) => {
    return triggers.find((t) => t.key === key)?.name || key;
  };

  // Filter automations by search query (search against live display name)
  const filteredAutomations = localAutomations.filter((automation) => {
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
        'screening.send_link':      'send screening link',
        'ai.score_resume':          'ai score resume',
        'esign.send_agreement':     'send esign adobe sign',
      };
      return (labelMap[action.type] || action.type).includes(query);
    });

    // Also search agent names
    const agentMatch = (() => {
      if (!automation.agent_id) return false;
      const agent = agents.find((a) => a.id === automation.agent_id);
      return agent?.name.toLowerCase().includes(query) ?? false;
    })();

    return displayName.includes(query) || triggerMatch || triggerNameMatch || actionTypeMatch || actionLabelMatch || agentMatch;
  });

  // ── Group automations by agent ───────────────────────────────────────────
  const agentGroups = useMemo(() => {
    const groups: Array<{ agent: AutomationAgent | null; automations: Automation[] }> = [];

    // Use localAgents order (already sorted / updated by drag-and-drop)
    for (const agent of localAgents) {
      const agentAutomations = filteredAutomations.filter((a) => a.agent_id === agent.id);
      // Show agent section even if empty (when not searching), hide when searching and empty
      if (agentAutomations.length > 0 || !searchQuery.trim()) {
        groups.push({ agent, automations: agentAutomations });
      }
    }

    // Unassigned at bottom
    const unassigned = filteredAutomations.filter((a) => !a.agent_id);
    if (unassigned.length > 0 || agents.length > 0) {
      groups.push({ agent: null, automations: unassigned });
    }

    return groups;
  }, [localAgents, filteredAutomations, searchQuery]);

  const toggleCollapse = (agentId: string) => {
    setCollapsedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      try {
        localStorage.setItem(collapsedStorageKey, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // ── Agent CRUD handlers ──────────────────────────────────────────────────
  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) return;
    try {
      await createJobAutomationAgent(companyId, jobId, {
        name: newAgentName.trim(),
        emoji: newAgentEmoji,
        description: newAgentDescription.trim(),
      });
      setCreatingAgent(false);
      setNewAgentName("");
      setNewAgentEmoji("👤");
      setNewAgentDescription("");
      setShowEmojiPicker(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRenameAgent = async (agentId: string) => {
    if (!editingAgentName.trim()) return;
    try {
      await updateJobAutomationAgent(companyId, jobId, agentId, {
        name: editingAgentName.trim(),
        emoji: editingAgentEmoji,
        description: editingAgentDescription.trim(),
      });
      setEditingAgentId(null);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleAgent = async (agentId: string, currentEnabled: boolean) => {
    try {
      await toggleJobAutomationAgent(companyId, jobId, agentId, !currentEnabled);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    const ok = await confirm({
      title: "Delete Agent",
      description: "This will delete the agent. All automations assigned to it will become unassigned (they won't be deleted).",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteJobAutomationAgent(companyId, jobId, agentId);
      setOpenMenuId(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ── Render an automation card ─────────────────────────────────────────────
  const renderAutomationCard = (automation: Automation, agentPaused = false) => (
    <div
      key={automation.id}
      onClick={() => onEdit(automation)}
      className={`border-2 rounded-lg p-5 transition-all cursor-pointer group ${
        automation.is_enabled && !agentPaused
          ? "border-rf-blue-tint bg-rf-blue-tint/30 hover:border-rf-blue hover:bg-rf-blue-tint/50"
          : "border-rf-border bg-rf-surface-page hover:border-rf-ink-300 hover:bg-rf-ink-100"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Recipe sentence — rendered from live column/label/group names */}
          <div className="flex items-center gap-3 mb-2">
            <p className="text-rf-ink-900 text-lg">
              {formatRecipeName(getDisplayName(automation))}
            </p>
            <span
              className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                automation.is_enabled && !agentPaused
                  ? "bg-rf-success-bg text-rf-success"
                  : "bg-rf-ink-100 text-rf-text-secondary"
              }`}
            >
              {automation.is_enabled && !agentPaused ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-rf-text-muted">
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
            aria-checked={automation.is_enabled && !agentPaused}
            onClick={(e) => {
              e.stopPropagation();
              if (!agentPaused) handleToggle(automation.id, automation.is_enabled);
            }}
            disabled={actionLoading === automation.id || agentPaused}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue focus-visible:ring-offset-2 disabled:opacity-50 ${
              automation.is_enabled && !agentPaused ? "bg-rf-success" : "bg-rf-ink-300"
            }`}
            title={agentPaused ? "Agent is paused" : automation.is_enabled ? "Disable" : "Enable"}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-rf-surface-card shadow transition-transform ${
                automation.is_enabled && !agentPaused ? "translate-x-4" : "translate-x-1"
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
              className="p-2 hover:bg-rf-ink-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <MoreVertical className="w-5 h-5 text-rf-text-secondary" />
            </button>

            {openMenuId === automation.id && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => { setOpenMenuId(null); setMoveMenuAutomationId(null); }}
                />

                {/* Menu */}
                <div className="absolute right-0 mt-1 w-52 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg z-20">
                  <button
                    onClick={() => {
                      onEdit(automation);
                      setOpenMenuId(null);
                    }}
                    className="w-full px-4 py-2.5 text-left text-rf-ink-700 hover:bg-rf-surface-page flex items-center gap-2 rounded-t-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDuplicate(automation.id)}
                    className="w-full px-4 py-2.5 text-left text-rf-ink-700 hover:bg-rf-surface-page flex items-center gap-2 transition-colors border-t border-rf-border"
                  >
                    <Copy className="w-4 h-4" />
                    Duplicate
                  </button>

                  {/* Move to Agent — inline expandable */}
                  {agents.length > 0 && (
                    <>
                      <button
                        onClick={() => setMoveMenuAutomationId(
                          moveMenuAutomationId === automation.id ? null : automation.id
                        )}
                        className="w-full px-4 py-2.5 text-left text-rf-ink-700 hover:bg-rf-surface-page flex items-center gap-2 transition-colors border-t border-rf-border"
                      >
                        <ArrowRight className="w-4 h-4" />
                        Move to Agent
                        {moveMenuAutomationId === automation.id
                          ? <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                          : <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                        }
                      </button>

                      {moveMenuAutomationId === automation.id && (
                        <div className="border-t border-rf-border bg-rf-surface-page">
                          {automation.agent_id && (
                            <button
                              onClick={() => handleMoveToAgent(automation.id, null)}
                              className="w-full px-6 py-2 text-left text-rf-text-secondary hover:bg-rf-ink-100 text-sm transition-colors"
                            >
                              Unassign
                            </button>
                          )}
                          {agents.map((agent) => (
                            <button
                              key={agent.id}
                              onClick={() => handleMoveToAgent(automation.id, agent.id)}
                              disabled={automation.agent_id === agent.id}
                              className="w-full px-6 py-2 text-left text-rf-ink-700 hover:bg-rf-ink-100 flex items-center gap-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-default"
                            >
                              <span>{agent.emoji}</span>
                              {agent.name}
                              {automation.agent_id === agent.id && <Check className="w-3.5 h-3.5 ml-auto text-rf-success" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => handleDelete(automation.id)}
                    className="w-full px-4 py-2.5 text-left text-rf-danger hover:bg-rf-danger-bg flex items-center gap-2 rounded-b-lg transition-colors border-t border-rf-border"
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
  );

  // ── Has any agents? Show grouped vs flat view ─────────────────────────────
  const hasAgents = agents.length > 0;

  return (
    <div className="p-6">
      {/* Search bar + New Agent button */}
      <div className="mb-6 flex gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search automations by name or trigger..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-rf-border rounded-lg focus:outline-none focus:ring-2 focus:ring-rf-blue"
          />
          {searchQuery && (
            <p className="text-xs text-rf-text-muted mt-1">
              Showing {filteredAutomations.length} of {localAutomations.length} automations
            </p>
          )}
        </div>
        <button
          onClick={() => setCreatingAgent(true)}
          className="h-[42px] px-3 border border-rf-border rounded-lg text-rf-ink-500 hover:bg-rf-surface-page hover:border-rf-ink-100 text-sm font-medium transition-colors flex items-center gap-1.5 shrink-0"
        >
          <UserRound className="w-4 h-4" />
          <span className="hidden sm:inline">New Agent</span>
        </button>
      </div>

      {/* Inline new agent form */}
      {creatingAgent && (
        <div className="mb-6 p-4 border-2 border-dashed border-rf-blue-tint rounded-lg bg-rf-blue-tint/10">
          <div className="space-y-3">
            {/* Row 1: Emoji button + Name input */}
            <div className="flex items-center gap-3">
              {/* Emoji selector button */}
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="w-10 h-10 rounded-lg border border-rf-border bg-rf-surface-card hover:bg-rf-surface-page text-xl flex items-center justify-center transition-colors"
                  title="Choose icon"
                >
                  {newAgentEmoji}
                </button>
                {showEmojiPicker && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                    <div className="absolute top-full left-0 mt-1 p-2 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg z-20 grid grid-cols-5 gap-1 w-[180px]">
                      {AGENT_EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => { setNewAgentEmoji(e); setShowEmojiPicker(false); }}
                          className={`w-8 h-8 rounded-md text-base flex items-center justify-center transition-colors ${
                            newAgentEmoji === e ? "bg-rf-blue text-white" : "hover:bg-rf-ink-100"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <input
                type="text"
                autoFocus
                placeholder="Agent name..."
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateAgent();
                  if (e.key === "Escape") { setCreatingAgent(false); setNewAgentName(""); setNewAgentDescription(""); setShowEmojiPicker(false); }
                }}
                className="flex-1 px-3 py-1.5 border border-rf-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue"
              />
              <button
                onClick={handleCreateAgent}
                disabled={!newAgentName.trim()}
                className="p-2 text-rf-success hover:bg-rf-success-bg rounded-lg transition-colors disabled:opacity-40"
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                onClick={() => { setCreatingAgent(false); setNewAgentName(""); setNewAgentDescription(""); setShowEmojiPicker(false); }}
                className="p-2 text-rf-text-muted hover:bg-rf-ink-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Row 2: Description */}
            <input
              type="text"
              placeholder="Short description (optional) — e.g. Handles intake emails and auto-screening"
              value={newAgentDescription}
              onChange={(e) => setNewAgentDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateAgent();
                if (e.key === "Escape") { setCreatingAgent(false); setNewAgentName(""); setNewAgentDescription(""); setShowEmojiPicker(false); }
              }}
              className="w-full px-3 py-1.5 border border-rf-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue text-rf-text-secondary"
            />
          </div>
        </div>
      )}

      {/* Automations List */}
      {filteredAutomations.length === 0 && !hasAgents ? (
        <div className="text-center py-16 bg-rf-surface-page rounded-lg border-2 border-dashed border-rf-border">
          <div className="mb-4">
            <svg
              className="w-16 h-16 mx-auto text-rf-text-muted"
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
          <p className="text-rf-text-muted text-lg font-medium">
            {searchQuery ? 'No matching automations' : 'No automations yet'}
          </p>
          <p className="text-rf-text-muted text-sm mt-2">
            {searchQuery
              ? 'Try a different search term'
              : 'Click the "Create" tab to build your first automation recipe'}
          </p>
        </div>
      ) : hasAgents ? (
        /* ── Grouped view ──────────────────────────────────────────────────── */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleAgentDragEnd}
        >
          <SortableContext
            items={localAgents.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
        <div className="space-y-4">
          {agentGroups.map(({ agent, automations: groupAutomations }) => {
            const isUnassigned = !agent;
            const collapseKey = agent ? agent.id : "__unassigned";
            const isCollapsed = collapsedAgents.has(collapseKey);
            const canDrag = !isUnassigned && !searchQuery.trim();

            return (
              <SortableAgentGroupItem
                key={agent?.id ?? "__unassigned"}
                id={agent?.id ?? "__unassigned"}
                isDraggable={canDrag}
                className="rounded-lg border border-rf-border"
              >
              {(dragHandleProps) => (<>
                {/* Agent section header */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 ${
                    isUnassigned
                      ? "bg-rf-surface-page"
                      : agent.is_enabled
                        ? "bg-rf-surface-card"
                        : "bg-rf-ink-100/50"
                  }`}
                >
                  {/* Drag handle (named agents only, not while searching) */}
                  {canDrag && (
                    <span
                      {...dragHandleProps}
                      className="cursor-grab active:cursor-grabbing p-0.5 text-rf-ink-300 hover:text-rf-ink-500 transition-colors touch-none"
                      title="Drag to reorder"
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>
                  )}

                  {/* Collapse toggle */}
                  <button
                    onClick={() => toggleCollapse(collapseKey)}
                    className="p-0.5 hover:bg-rf-ink-100 rounded transition-colors"
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-4 h-4 text-rf-text-muted" />
                      : <ChevronDown className="w-4 h-4 text-rf-text-muted" />
                    }
                  </button>

                  {/* Emoji + Name + Description */}
                  {isUnassigned ? (
                    <span className="text-sm font-medium text-rf-text-secondary">Unassigned</span>
                  ) : editingAgentId === agent.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      {/* Clickable emoji picker */}
                      <div className="relative">
                        <button
                          onClick={() => setShowEditEmojiPicker(!showEditEmojiPicker)}
                          className="w-9 h-9 rounded-lg border border-rf-border bg-rf-surface-card hover:bg-rf-surface-page text-xl flex items-center justify-center transition-colors"
                          title="Change icon"
                        >
                          {editingAgentEmoji}
                        </button>
                        {showEditEmojiPicker && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowEditEmojiPicker(false)} />
                            <div className="absolute top-full left-0 mt-1 p-2 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg z-20 grid grid-cols-5 gap-1 w-[180px]">
                              {AGENT_EMOJIS.map((e) => (
                                <button
                                  key={e}
                                  onClick={() => { setEditingAgentEmoji(e); setShowEditEmojiPicker(false); }}
                                  className={`w-8 h-8 rounded-md text-base flex items-center justify-center transition-colors ${
                                    editingAgentEmoji === e ? "bg-rf-blue text-white" : "hover:bg-rf-ink-100"
                                  }`}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <input
                          autoFocus
                          value={editingAgentName}
                          onChange={(e) => setEditingAgentName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameAgent(agent.id);
                            if (e.key === "Escape") setEditingAgentId(null);
                          }}
                          placeholder="Agent name..."
                          className="w-full px-2 py-1 border border-rf-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue"
                        />
                        <input
                          value={editingAgentDescription}
                          onChange={(e) => setEditingAgentDescription(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameAgent(agent.id);
                            if (e.key === "Escape") setEditingAgentId(null);
                          }}
                          placeholder="Short description (optional)"
                          className="w-full px-2 py-1 border border-rf-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-rf-blue text-rf-text-secondary"
                        />
                      </div>
                      <button onClick={() => handleRenameAgent(agent.id)} className="p-1 text-rf-success hover:bg-rf-success-bg rounded"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingAgentId(null)} className="p-1 text-rf-text-muted hover:bg-rf-ink-100 rounded"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-rf-ink-900">{agent.name}</span>
                        {agent.description && (
                          <span className="text-xs text-rf-text-muted leading-tight">{agent.description}</span>
                        )}
                      </div>
                    </>
                  )}

                  {/* Count badge */}
                  <span className="text-xs text-rf-text-muted bg-rf-ink-100 px-2 py-0.5 rounded-full">
                    {groupAutomations.length}
                  </span>

                  <div className="ml-auto flex items-center gap-2">
                    {/* Agent toggle */}
                    {!isUnassigned && (
                      <>
                        {!agent.is_enabled && (
                          <span className="text-xs text-rf-text-muted font-medium">Paused</span>
                        )}
                        <button
                          role="switch"
                          aria-checked={agent.is_enabled}
                          onClick={() => handleToggleAgent(agent.id, agent.is_enabled)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue focus-visible:ring-offset-2 ${
                            agent.is_enabled ? "bg-rf-success" : "bg-rf-ink-300"
                          }`}
                          title={agent.is_enabled ? "Pause all automations in this agent" : "Resume all automations in this agent"}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-rf-surface-card shadow transition-transform ${
                              agent.is_enabled ? "translate-x-4" : "translate-x-1"
                            }`}
                          />
                        </button>

                        {/* Agent kebab */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === `agent-${agent.id}` ? null : `agent-${agent.id}`)}
                            className="p-1.5 hover:bg-rf-ink-100 rounded-lg transition-colors"
                          >
                            <MoreVertical className="w-4 h-4 text-rf-text-secondary" />
                          </button>

                          {openMenuId === `agent-${agent.id}` && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 mt-1 w-40 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg z-20">
                                <button
                                  onClick={() => {
                                    setEditingAgentId(agent.id);
                                    setEditingAgentName(agent.name);
                                    setEditingAgentDescription(agent.description || "");
                                    setEditingAgentEmoji(agent.emoji);
                                    setShowEditEmojiPicker(false);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-rf-ink-700 hover:bg-rf-surface-page flex items-center gap-2 rounded-t-lg text-sm transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteAgent(agent.id)}
                                  className="w-full px-4 py-2.5 text-left text-rf-danger hover:bg-rf-danger-bg flex items-center gap-2 rounded-b-lg text-sm transition-colors border-t border-rf-border"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Automation cards */}
                {!isCollapsed && (
                  <div className={`p-3 space-y-3 ${agent && !agent.is_enabled ? "opacity-50" : ""}`}>
                    {groupAutomations.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-rf-text-muted">
                          No automations assigned to this agent yet
                        </p>
                        {agent && onAddTaskForAgent && (
                          <button
                            onClick={() => onAddTaskForAgent(agent.id)}
                            className="mt-2 text-sm text-rf-blue hover:text-rf-blue-dark font-medium inline-flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Task
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {groupAutomations.map((a) => renderAutomationCard(a, agent ? !agent.is_enabled : false))}
                        {agent && onAddTaskForAgent && (
                          <button
                            onClick={() => onAddTaskForAgent(agent.id)}
                            className="w-full py-2 text-sm text-rf-text-muted hover:text-rf-blue font-medium inline-flex items-center justify-center gap-1 border border-dashed border-rf-border rounded-lg hover:border-rf-blue transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Task
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>)}
              </SortableAgentGroupItem>
            );
          })}
        </div>
          </SortableContext>
        </DndContext>
      ) : (
        /* ── Flat view (no agents created yet) ────────────────────────────── */
        <div className="space-y-3">
          {filteredAutomations.map((a) => renderAutomationCard(a))}
        </div>
      )}

      {/* Stats Summary */}
      {localAutomations.length > 0 && (
        <div className="mt-8 pt-6 border-t border-rf-border">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-rf-ink-900">{localAutomations.length}</p>
              <p className="text-sm text-rf-text-muted">Total Recipes</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-rf-success">
                {localAutomations.filter((a) => a.is_enabled).length}
              </p>
              <p className="text-sm text-rf-text-muted">Active</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-rf-text-muted">
                {localAutomations.filter((a) => !a.is_enabled).length}
              </p>
              <p className="text-sm text-rf-text-muted">Inactive</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
