"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, X, ChevronDown, Search, ArrowRight, RefreshCw, Trash2, Calendar, Hash, TrendingUp, Mail, MessageSquare, Phone, PhoneCall, ExternalLink, GraduationCap, Settings, Shield, Award, Brain } from "lucide-react";
import { createJobAutomation, updateJobAutomation, getJobBoardColumns, getLmsCoursesForCompany } from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";
import { EmailGmailEditor } from "./EmailGmailEditor";
import { SendEmailGmailAction } from "./SendEmailGmailAction";
import { TwilioSmsAction } from "./TwilioSmsAction";
import { TwilioCallAction } from "./TwilioCallAction";

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

interface Column {
  id: string;
  name: string;
  type: string;
  labels?: Array<{
    id: string;
    label: string;
    color: string;
  }>;
}

interface Action {
  type: string;
  config: Record<string, any>;
}

interface FilterCondition {
  type: string;
  column_id?: string;
  value: string | number | "";
}

// Conditions available per column category — drives the new Column → Condition → Value UX
const COLUMN_CONDITIONS: Record<string, Array<{ value: string; label: string }>> = {
  status: [
    { value: "status_is",     label: "is" },
    { value: "status_is_not", label: "is not" },
  ],
  text: [
    { value: "text_equals",   label: "equals" },
    { value: "text_contains", label: "contains" },
    { value: "is_not_empty",  label: "is not empty" },
    { value: "is_empty",      label: "is empty" },
  ],
  number: [
    { value: "number_eq",     label: "=" },
    { value: "number_gt",     label: ">" },
    { value: "number_gte",    label: "≥" },
    { value: "number_lt",     label: "<" },
    { value: "number_lte",    label: "≤" },
    { value: "is_not_empty",  label: "is not empty" },
    { value: "is_empty",      label: "is empty" },
  ],
  date: [
    { value: "date_is",       label: "is" },
    { value: "date_before",   label: "before" },
    { value: "date_after",    label: "after" },
    { value: "is_not_empty",  label: "is not empty" },
    { value: "is_empty",      label: "is empty" },
  ],
  file: [
    { value: "is_not_empty",  label: "is not empty" },
    { value: "is_empty",      label: "is empty" },
  ],
};

// Text-like column types that store their value in value_text
const TEXT_COL_TYPES = ["text", "email", "phone", "location"];

// Map a board column to its condition category
function getColCategory(col?: Column): string | null {
  if (!col) return null;
  if (col.type === "status") return "status";
  if (TEXT_COL_TYPES.includes(col.type)) return "text";
  if (col.type === "number") return "number";
  if (col.type === "date") return "date";
  if (col.type === "file") return "file";
  return "text"; // fallback for unknown types
}

// Human-readable operator label for each condition type
function conditionOpLabel(type: string): string {
  const map: Record<string, string> = {
    status_is: "is", status_is_not: "is not",
    text_equals: "equals", text_contains: "contains",
    number_eq: "=", number_gt: ">", number_gte: "≥", number_lt: "<", number_lte: "≤",
    date_is: "is", date_before: "before", date_after: "after",
    item_in_group: "in group",
    is_empty: "is empty", is_not_empty: "is not empty",
  };
  return map[type] ?? type;
}

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

interface CreateTabProps {
  companyId: string;
  jobId: string;
  accountId: string;
  triggers: Trigger[];
  groups: Group[];
  onCreated: () => void;
  editingAutomation?: Automation | null;
  onCancelEdit?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function CreateTab({
  companyId,
  jobId,
  accountId,
  triggers,
  groups,
  onCreated,
  editingAutomation,
  onCancelEdit,
  onDirtyChange,
}: CreateTabProps) {
  const [selectedTrigger, setSelectedTrigger] = useState<Trigger | null>(null);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<Column[]>([]);
  const [lmsCourses, setLmsCourses] = useState<{ id: string; name: string }[]>([]);
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);

  const isEditing = !!editingAutomation;

  // Track dirty state for unsaved changes guard
  useEffect(() => {
    const isDirty = selectedTrigger !== null || actions.length > 0;
    onDirtyChange?.(isDirty);
  }, [selectedTrigger, actions.length, onDirtyChange]);

  // Fetch board columns when component mounts
  useEffect(() => {
    async function fetchColumns() {
      try {
        const cols = await getJobBoardColumns(companyId, jobId);
        setColumns(cols || []);
      } catch (err) {
        console.error('Failed to fetch board columns:', err);
      }
    }
    fetchColumns();
  }, [companyId, jobId]);

  // Fetch published LMS courses for this company (used by lms.send_training_link)
  useEffect(() => {
    async function fetchCourses() {
      try {
        const courses = await getLmsCoursesForCompany(companyId);
        setLmsCourses(courses || []);
      } catch (err) {
        console.error('Failed to fetch LMS courses:', err);
      }
    }
    fetchCourses();
  }, [companyId]);

  // Pre-fill form when editing
  useEffect(() => {
    if (editingAutomation) {
      // Find the trigger
      const trigger = triggers.find((t) => t.key === editingAutomation.trigger_key);
      setSelectedTrigger(trigger || null);

      // Separate trigger-config keys from the "and only if…" conditions array
      const { conditions: savedConditions, ...triggerConfigOnly } = editingAutomation.filter || {};
      setTriggerConfig(triggerConfigOnly || {});
      setFilterConditions(
        Array.isArray(savedConditions)
          ? savedConditions.map((c: any) => ({
              type: c.type ?? "text_equals",
              column_id: c.column_id,
              value: c.value ?? "",
            }))
          : []
      );

      // Set actions
      const editActions = editingAutomation.automation_actions
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((action) => ({
          type: action.type,
          config: action.config,
        }));
      setActions(editActions);
    }
  }, [editingAutomation, triggers]);

  const resetForm = () => {
    setSelectedTrigger(null);
    setTriggerConfig({});
    setActions([]);
    setFilterConditions([]);
  };

  const addAction = () => {
    if (actions.length >= 5) {
      alert("Maximum 5 actions per automation");
      return;
    }

    setActions([...actions, { type: "move_group", config: {} }]);
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

    // Validate trigger config
    if (selectedTrigger.key === "board.status_changes_to") {
      if (!triggerConfig.column_id || !triggerConfig.changes_to) {
        alert("Please select a status column and value");
        return;
      }
    }

    // Validate actions
    for (const action of actions) {
      if (action.type === "move_group" && !action.config.to_group_id) {
        alert("Please select a target group for 'Move to group' action");
        return;
      }
      if (action.type === "change_status" && (!action.config.column_id || !action.config.value)) {
        alert("Please select a column and value for 'Change status' action");
        return;
      }
      if (action.type === "set_date" && (!action.config.column_id || !action.config.value)) {
        alert("Please select a column and value for 'Set date' action");
        return;
      }
      if (action.type === "set_number" && (!action.config.column_id || action.config.value === undefined)) {
        alert("Please select a column and value for 'Set number' action");
        return;
      }
      if (action.type === "inc_dec" && (!action.config.column_id || !action.config.operation)) {
        alert("Please configure 'Increment/Decrement' action");
        return;
      }
      if (action.type === "send_slack" && (!action.config.webhook_url || !action.config.message)) {
        alert("Please enter Slack webhook URL and message");
        return;
      }
      if (action.type === "email_gmail") {
        if (!action.config.gmail_connection_id || !action.config.recipient_column_id || !action.config.subject || !action.config.body) {
          alert("Please configure all Gmail email fields");
          return;
        }
      }
      if (action.type === "send_email_gmail") {
        if (!action.config.connection_id || !action.config.recipient_column_id || !action.config.subject) {
          alert("Please configure Gmail account, recipient, and subject");
          return;
        }
      }
      if (action.type === "twilio.send_sms") {
        const ts = action.config.toSource;
        if (!ts || (ts.type === "column" && !ts.columnId) || (ts.type === "manual" && !ts.value)) {
          alert("Please configure the recipient for Send SMS");
          return;
        }
        if (!action.config.message) {
          alert("Please enter a message for Send SMS");
          return;
        }
      }
      if (action.type === "twilio.make_call_say") {
        const ts = action.config.toSource;
        if (!ts || (ts.type === "column" && !ts.columnId) || (ts.type === "manual" && !ts.value)) {
          alert("Please configure the recipient for Call Someone and Say");
          return;
        }
        if (!action.config.say) {
          alert("Please enter text to say for Call Someone and Say");
          return;
        }
      }
      if (action.type === "integration.set_field") {
        if (!action.config.field_key) {
          alert("Please choose a FADV field for 'Set integration field'");
          return;
        }
        if (action.config.value === undefined || action.config.value === null || action.config.value === "") {
          alert("Please enter a value for 'Set integration field'");
          return;
        }
      }
      if (action.type === "fadv.add_subject") {
        if (
          !action.config.package_column_id ||
          !action.config.facility_id_column_id ||
          !action.config.position_type_column_id
        ) {
          alert("Please select all three input columns (Package, Facility ID, Position Type) for the FADV action");
          return;
        }
        if (!action.config.output_column_id) {
          alert("Please select an output column for the FADV action (where status messages will be written)");
          return;
        }
      }
      if (action.type === "safety_trainer.submit") {
        if (
          !action.config.driver_fedex_id_column_id ||
          !action.config.start_date_column_id ||
          !action.config.completion_date_column_id ||
          !action.config.contract_number_column_id
        ) {
          alert("Please select all four input columns (Driver FedEx ID, Start Date, Completion Date, Contract Number) for the Impact Solutions Safety Cert action");
          return;
        }
        if (!action.config.output_column_id) {
          alert("Please select an output column for the Impact Solutions Safety Cert action (where status messages will be written)");
          return;
        }
      }
      if (action.type === "lms.send_training_link") {
        if (!action.config.course_id) {
          alert("Please select a training course for the 'Send Training Link' action");
          return;
        }
      }
      if (action.type === "ai.score_resume") {
        if (!action.config.score_column_id) {
          alert("Please select a score output column for the AI scoring action");
          return;
        }
        if (!action.config.feedback_column_id) {
          alert("Please select a feedback output column for the AI scoring action");
          return;
        }
        if (!action.config.criteria?.trim()) {
          alert("Please enter scoring criteria for the AI scoring action");
          return;
        }
      }
    }

    setLoading(true);
    try {
      const name = buildRecipeName();

      // Merge trigger config with any "and only if…" conditions.
      // Strip incomplete conditions (those missing column_id or value).
      const validConditions = filterConditions.filter((c) =>
        c.type === "item_in_group" ? c.value !== "" : c.column_id && c.value !== ""
      );
      const filterToSave: Record<string, any> = { ...triggerConfig };
      if (validConditions.length > 0) {
        filterToSave.conditions = validConditions.map((c) => ({
          type: c.type,
          ...(c.column_id ? { column_id: c.column_id } : {}),
          value: c.value,
        }));
      }

      if (isEditing && editingAutomation) {
        // Update existing automation
        await updateJobAutomation(companyId, jobId, editingAutomation.id, {
          name,
          trigger_key: selectedTrigger.key,
          filter: filterToSave,
          actions: actions.map((action, index) => ({
            type: action.type,
            config: action.config,
            sort_order: index,
          })),
        });
      } else {
        // Create new automation
        await createJobAutomation(companyId, jobId, {
          name,
          trigger_key: selectedTrigger.key,
          filter: filterToSave,
          actions: actions.map((action, index) => ({
            type: action.type as any,
            config: action.config,
            sort_order: index,
          })),
        });
      }

      resetForm();
      onCreated();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const buildRecipeName = (): string => {
    if (!selectedTrigger) return "";

    let triggerText = selectedTrigger.name;

    // Build readable trigger text
    if (selectedTrigger.key === "board.status_changes_to") {
      const column = columns.find((c) => c.id === triggerConfig.column_id);
      const label = column?.labels?.find((l) => l.id === triggerConfig.changes_to);
      if (column && label) {
        triggerText = `${column.name} changes to ${label.label}`;
      }
    } else if (selectedTrigger.key === "applicant.moved_group") {
      const group = groups.find((g) => g.id === triggerConfig.to_group_id);
      if (group) {
        triggerText = `applicant moved to ${group.name}`;
      }
    }

    // Build readable action text
    const actionTexts = actions.map((action) => {
      switch (action.type) {
        case "move_group": {
          const group = groups.find((g) => g.id === action.config.to_group_id);
          return group ? `move to ${group.name}` : "move to group";
        }
        case "change_status": {
          const column = columns.find((c) => c.id === action.config.column_id);
          const label = column?.labels?.find((l) => l.id === action.config.value);
          return column && label ? `set ${column.name} to ${label.label}` : "change status";
        }
        case "delete_item":
          return "delete item";
        case "set_date": {
          const column = columns.find((c) => c.id === action.config.column_id);
          return column ? `set ${column.name} to ${action.config.value}` : "set date";
        }
        case "set_number": {
          const column = columns.find((c) => c.id === action.config.column_id);
          return column ? `set ${column.name} to ${action.config.value}` : "set number";
        }
        case "inc_dec": {
          const column = columns.find((c) => c.id === action.config.column_id);
          const op = action.config.operation === "increment" ? "increase" : "decrease";
          return column ? `${op} ${column.name}` : "increment/decrement";
        }
        case "send_email":
          return "send email";
        case "send_slack":
          return "send Slack notification";
        case "email_gmail": {
          const recipientCol = columns.find((c) => c.id === action.config.recipient_column_id);
          return recipientCol ? `send email to ${recipientCol.name}` : "send Gmail email";
        }
        case "send_email_gmail": {
          const recipientCol = columns.find((c) => c.id === action.config.recipient_column_id);
          return recipientCol ? `send email to ${recipientCol.name}` : "send email";
        }
        case "twilio.send_sms": {
          const ts = action.config.toSource;
          if (ts?.type === "column") {
            const col = columns.find((c) => c.id === ts.columnId);
            return col ? `send SMS to ${col.name}` : "send SMS";
          }
          return ts?.value ? `send SMS to ${ts.value}` : "send SMS";
        }
        case "twilio.make_call_say": {
          const ts = action.config.toSource;
          if (ts?.type === "column") {
            const col = columns.find((c) => c.id === ts.columnId);
            return col ? `call ${col.name} and say` : "make call";
          }
          return ts?.value ? `call ${ts.value} and say` : "make call";
        }
        case "integration.set_field": {
          const fieldLabel = action.config.field_key
            ? action.config.field_key.replace(/_/g, " ")
            : "field";
          return `set FADV ${fieldLabel} to "${action.config.value ?? ""}"`;
        }
        case "fadv.add_subject":
          return "submit applicant to First Advantage";
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

    // Build condition summary for valid conditions
    const validConditions = filterConditions.filter((c) => {
      if (c.type === "item_in_group") return c.value !== "";
      if (c.type === "is_empty" || c.type === "is_not_empty") return !!c.column_id;
      return !!(c.column_id && c.value !== "");
    });
    const conditionTexts = validConditions.map((cond) => {
      if (cond.type === "item_in_group") {
        const group = groups.find((g) => g.id === cond.value);
        return `in group ${group?.name ?? String(cond.value)}`;
      }
      const col = columns.find((c) => c.id === cond.column_id);
      if (!col) return "";
      let valueDisplay = String(cond.value);
      if ((cond.type === "status_is" || cond.type === "status_is_not") && col.labels) {
        const lbl = col.labels.find((l) => l.id === cond.value);
        if (lbl) valueDisplay = lbl.label;
      }
      if (cond.type === "is_empty" || cond.type === "is_not_empty") {
        return `${col.name} ${conditionOpLabel(cond.type)}`;
      }
      return `${col.name} ${conditionOpLabel(cond.type)} ${valueDisplay}`;
    }).filter(Boolean);

    const conditionSuffix = conditionTexts.length > 0
      ? ` AND only if ${conditionTexts.join(" AND ")}`
      : "";

    return `When ${triggerText}${conditionSuffix} → ${actionTexts.join(" and ")}`;
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="space-y-3">
        {/* Trigger Selector */}
        <TriggerSelector
          triggers={triggers}
          selectedTrigger={selectedTrigger}
          onSelect={(trigger) => {
            // Reset config when trigger type changes so stale keys
            // (e.g. to_group_id from applicant.moved_group) don't bleed
            // into the new trigger's filter on save.
            if (trigger?.key !== selectedTrigger?.key) {
              setTriggerConfig({});
            }
            setSelectedTrigger(trigger);
          }}
          triggerConfig={triggerConfig}
          onConfigChange={setTriggerConfig}
          columns={columns}
          groups={groups}
          filterConditions={filterConditions}
          onFilterConditionsChange={setFilterConditions}
        />

        {/* Connector line */}
        {selectedTrigger && (
          <div className="flex justify-center">
            <div className="w-px h-4 bg-gray-300" />
          </div>
        )}

        {/* Actions */}
        {selectedTrigger && (
          <div className="space-y-2">
            {actions.map((action, index) => (
              <ActionEditor
                key={index}
                action={action}
                index={index}
                columns={columns}
                groups={groups}
                lmsCourses={lmsCourses}
                companyId={companyId}
                accountId={accountId}
                onChange={(updates) => updateAction(index, updates)}
                onRemove={() => removeAction(index)}
                triggerKey={selectedTrigger?.key}
                triggerConfig={triggerConfig}
                filterConditions={filterConditions}
              />
            ))}

            {actions.length < 5 && (
              <ActionTypePicker
                onSelect={(type) => {
                  setActions([...actions, { type, config: {} }]);
                }}
              />
            )}
          </div>
        )}

        {/* Create/Update Buttons */}
        {selectedTrigger && actions.length > 0 && (
          <div className="flex justify-center gap-2 pt-3">
            {isEditing && onCancelEdit && (
              <button
                onClick={onCancelEdit}
                disabled={loading}
                className="px-5 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 font-medium"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleCreate}
              disabled={loading}
              className="px-5 py-2 text-sm bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark transition-colors disabled:opacity-50 font-medium"
            >
              {loading
                ? isEditing
                  ? "Updating..."
                  : "Creating..."
                : isEditing
                ? "Update automation"
                : "Create automation"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Trigger Selector Component
// ============================================================================

function TriggerSelector({
  triggers,
  selectedTrigger,
  onSelect,
  triggerConfig,
  onConfigChange,
  columns,
  groups,
  filterConditions = [],
  onFilterConditionsChange,
}: {
  triggers: Trigger[];
  selectedTrigger: Trigger | null;
  onSelect: (trigger: Trigger | null) => void;
  triggerConfig: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  columns: Column[];
  groups: Group[];
  filterConditions?: FilterCondition[];
  onFilterConditionsChange?: (conditions: FilterCondition[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Monday.com-style triggers to show first
  const priorityTriggers = [
    "board.status_changes_to",
    "applicant.moved_group",
    "applicant.created",
    "form.submitted",
  ];

  const sortedTriggers = [...triggers].sort((a, b) => {
    const aIndex = priorityTriggers.indexOf(a.key);
    const bIndex = priorityTriggers.indexOf(b.key);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return 0;
  });

  if (!selectedTrigger) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-left flex items-center justify-between hover:border-blue-400 transition-colors bg-rf-surface-card text-sm"
        >
          <span className="text-gray-500">When this happens...</span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
            {sortedTriggers.map((trigger) => (
              <button
                key={trigger.id}
                onClick={() => {
                  onSelect(trigger);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-rf-blue-tint transition-colors border-b border-gray-100 last:border-b-0"
              >
                <p className="text-sm font-medium text-gray-900">{trigger.name}</p>
                {trigger.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{trigger.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Render interactive sentence for selected trigger
  return (
    <div className="border border-rf-blue-tint bg-rf-blue-tint/60 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5 text-sm flex-1 min-w-0">
          {/* Interactive Sentence */}
          {selectedTrigger.key === "board.status_changes_to" && (
            <>
              <span className="text-gray-600">When</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "status")}
                selectedId={triggerConfig.column_id}
                onSelect={(id) => onConfigChange({ ...triggerConfig, column_id: id, changes_to: undefined })}
                placeholder="status column"
              />
              <span className="text-gray-600">changes to</span>
              {triggerConfig.column_id && (
                <StatusLabelPicker
                  column={columns.find((c) => c.id === triggerConfig.column_id)}
                  selectedId={triggerConfig.changes_to}
                  onSelect={(id) => onConfigChange({ ...triggerConfig, changes_to: id })}
                  placeholder="value"
                />
              )}
            </>
          )}

          {selectedTrigger.key === "applicant.moved_group" && (
            <>
              <span className="text-gray-600">When applicant moved to</span>
              <GroupPicker
                groups={groups}
                selectedId={triggerConfig.to_group_id}
                onSelect={(id) => onConfigChange({ ...triggerConfig, to_group_id: id })}
                placeholder="group"
                allowAny
              />
            </>
          )}

          {selectedTrigger.key === "applicant.created" && (
            <span className="text-gray-600">When applicant is created</span>
          )}

          {selectedTrigger.key === "form.submitted" && (
            <span className="text-gray-600">When application form is submitted</span>
          )}

          {/* Fallback for any trigger without a custom sentence */}
          {!["board.status_changes_to", "applicant.moved_group", "applicant.created", "form.submitted"].includes(selectedTrigger.key) && (
            <span className="text-gray-600">When {selectedTrigger.name.toLowerCase()}</span>
          )}
        </div>

        <button
          onClick={() => onSelect(null)}
          className="p-1 hover:bg-rf-blue-tint rounded ml-2 flex-shrink-0"
        >
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Inline "and only if..." conditions */}
      {onFilterConditionsChange && (
        filterConditions.length === 0 ? (
          <button
            onClick={() => onFilterConditionsChange([{ type: "is_not_empty", column_id: undefined, value: "" }])}
            className="text-xs text-rf-blue-light hover:text-rf-blue transition-colors flex items-center gap-1 mt-2"
          >
            <Plus className="w-3 h-3" />
            and only if...
          </button>
        ) : (
          <div className="mt-2 pt-2 border-t border-rf-blue-tint">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-rf-blue">and only if...</span>
              <button
                onClick={() => onFilterConditionsChange([...filterConditions, { type: "is_not_empty", column_id: undefined, value: "" }])}
                className="text-xs text-rf-blue hover:text-rf-blue flex items-center gap-0.5 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {filterConditions.map((cond, index) => (
                <FilterConditionRow
                  key={index}
                  condition={cond}
                  columns={columns}
                  groups={groups}
                  onChange={(updates) => {
                    const next = [...filterConditions];
                    next[index] = { ...next[index], ...updates };
                    onFilterConditionsChange(next);
                  }}
                  onRemove={() => onFilterConditionsChange(filterConditions.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ============================================================================
// Filter Conditions Editor ("and only if…") — standalone (kept for reference)
// ============================================================================

function FilterConditionsEditor({
  conditions,
  columns,
  groups,
  onChange,
}: {
  conditions: FilterCondition[];
  columns: Column[];
  groups: Group[];
  onChange: (conditions: FilterCondition[]) => void;
}) {
  const addCondition = () => {
    onChange([...conditions, { type: "text_equals", column_id: undefined, value: "" }]);
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const next = [...conditions];
    next[index] = { ...next[index], ...updates };
    onChange(next);
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  if (conditions.length === 0) {
    return (
      <div className="flex justify-center">
        <button
          onClick={addCondition}
          className="text-sm text-gray-400 hover:text-rf-warning transition-colors flex items-center gap-1.5 px-4 py-2 border border-dashed border-gray-300 rounded-lg hover:border-amber-300 hover:bg-rf-warning-bg/30"
        >
          <Plus className="w-3.5 h-3.5" />
          and only if… (optional filter)
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-amber-200 bg-rf-warning-bg/40 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-rf-warning">and only if…</span>
        <button
          onClick={addCondition}
          className="text-xs text-rf-warning hover:text-rf-warning flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add condition
        </button>
      </div>
      <div className="space-y-2">
        {conditions.map((cond, index) => (
          <FilterConditionRow
            key={index}
            condition={cond}
            columns={columns}
            groups={groups}
            onChange={(updates) => updateCondition(index, updates)}
            onRemove={() => removeCondition(index)}
          />
        ))}
      </div>
    </div>
  );
}

function FilterConditionRow({
  condition,
  columns,
  groups,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  columns: Column[];
  groups: Group[];
  onChange: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
}) {
  // Sentinel used when the user picks "Group membership" in the column picker
  const SENTINEL_GROUP = "__group__";

  const isGroupCondition = condition.type === "item_in_group";
  const effectiveColumnId = isGroupCondition ? SENTINEL_GROUP : condition.column_id;

  const selectedColumn = columns.find((c) => c.id === condition.column_id);
  const colCategory = getColCategory(selectedColumn);
  const availableConditions = colCategory ? (COLUMN_CONDITIONS[colCategory] ?? []) : [];

  const isNoValueCondition = condition.type === "is_empty" || condition.type === "is_not_empty";
  const isStatusCondition  = condition.type === "status_is" || condition.type === "status_is_not";
  const isTextCondition    = condition.type === "text_equals" || condition.type === "text_contains";
  const isNumberCondition  = condition.type.startsWith("number_");
  const isDateCondition    = condition.type.startsWith("date_");

  function handleColumnSelect(id: string) {
    if (id === SENTINEL_GROUP) {
      onChange({ type: "item_in_group", column_id: undefined, value: "" });
      return;
    }
    const col = columns.find((c) => c.id === id);
    const cat = getColCategory(col);
    const firstCond = cat ? (COLUMN_CONDITIONS[cat]?.[0]?.value ?? "is_not_empty") : "is_not_empty";
    onChange({ column_id: id, type: firstCond, value: "" });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-rf-surface-card border border-rf-blue-tint rounded px-2 py-1.5">

      {/* 1. Column picker — all columns + "Group membership" sentinel */}
      <ColumnPicker
        columns={columns}
        selectedId={effectiveColumnId}
        onSelect={handleColumnSelect}
        placeholder="column"
        extraOptions={[{ id: SENTINEL_GROUP, name: "Group membership" }]}
      />

      {/* 2. Condition dropdown — only shown after a column is selected */}
      {!isGroupCondition && condition.column_id && availableConditions.length > 0 && (
        <select
          value={condition.type}
          onChange={(e) => onChange({ type: e.target.value, value: "" })}
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-rf-surface-card focus:outline-none focus:ring-1 focus:ring-rf-blue"
        >
          {availableConditions.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      )}

      {/* 3. Value input — varies by condition type; hidden for is_empty / is_not_empty */}
      {isGroupCondition && (
        <GroupPicker
          groups={groups}
          selectedId={typeof condition.value === "string" ? condition.value : undefined}
          onSelect={(id) => onChange({ value: id ?? "" })}
          placeholder="group"
        />
      )}

      {!isNoValueCondition && isStatusCondition && condition.column_id && (
        <StatusLabelPicker
          column={selectedColumn}
          selectedId={typeof condition.value === "string" ? condition.value : undefined}
          onSelect={(id) => onChange({ value: id })}
          placeholder="value"
        />
      )}

      {!isNoValueCondition && isTextCondition && (
        <input
          type="text"
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="value…"
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-rf-surface-card min-w-[100px] focus:outline-none focus:ring-1 focus:ring-rf-blue"
        />
      )}

      {!isNoValueCondition && isNumberCondition && (
        <input
          type="number"
          value={condition.value === "" ? "" : condition.value}
          onChange={(e) =>
            onChange({ value: e.target.value === "" ? "" : parseFloat(e.target.value) })
          }
          placeholder="0"
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-rf-surface-card w-20 focus:outline-none focus:ring-1 focus:ring-rf-blue"
        />
      )}

      {!isNoValueCondition && isDateCondition && (
        <input
          type="date"
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onChange({ value: e.target.value })}
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-rf-surface-card focus:outline-none focus:ring-1 focus:ring-rf-blue"
        />
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="ml-auto p-1 hover:bg-rf-danger-bg rounded text-gray-400 hover:text-rf-danger transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============================================================================
// Action Editor Component
// ============================================================================

function ActionEditor({
  action,
  index,
  columns,
  groups,
  lmsCourses,
  companyId,
  accountId,
  onChange,
  onRemove,
  triggerKey,
  triggerConfig,
  filterConditions,
}: {
  action: Action;
  index: number;
  columns: Column[];
  groups: Group[];
  lmsCourses: { id: string; name: string }[];
  companyId: string;
  accountId: string;
  onChange: (updates: Partial<Action>) => void;
  onRemove: () => void;
  triggerKey?: string;
  triggerConfig?: Record<string, any>;
  filterConditions?: FilterCondition[];
}) {
  const actionTypes = [
    { value: "move_group", label: "Move item to group" },
    { value: "change_status", label: "Change status" },
    { value: "delete_item", label: "Delete item" },
    { value: "set_date", label: "Set date" },
    { value: "set_number", label: "Set number to a value" },
    { value: "inc_dec", label: "Increase/decrease value" },
    { value: "send_email", label: "Send email (stub)" },
    { value: "send_slack", label: "Send Slack notification" },
    { value: "send_email_gmail", label: "Send Email (Gmail)" },
    { value: "twilio.send_sms", label: "Send SMS (Twilio)" },
    { value: "twilio.make_call_say", label: "Call Someone and Say (Twilio)" },
    { value: "integration.set_field", label: "Set integration field (FADV)" },
    { value: "fadv.add_subject", label: "Add to FADV" },
    { value: "safety_trainer.submit", label: "Submit Impact Solutions Safety Cert" },
    { value: "lms.send_training_link", label: "Send Training Link (LMS)" },
    { value: "portal.send_link", label: "Send Applicant Status Portal Link" },
  ];

  const FADV_FIELD_OPTIONS = [
    { value: "package",       label: "Package" },
    { value: "location",      label: "Location" },
    { value: "facility_id",   label: "Facility ID" },
    { value: "position_type", label: "Position Type" },
  ];

  // Refs for variable picker cursor-position insertion
  const lmsSubjectRef   = useRef<HTMLInputElement>(null);
  const lmsMessageRef   = useRef<HTMLTextAreaElement>(null);
  const portalSubjectRef = useRef<HTMLInputElement>(null);
  const portalMessageRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="border border-green-200 bg-rf-success-bg/60 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <ActionTypeLabel
          type={action.type}
          actionTypes={actionTypes}
          onChange={(type) => onChange({ type, config: {} })}
        />
        <button
          onClick={onRemove}
          className="p-1 hover:bg-rf-success-bg rounded flex-shrink-0"
        >
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Interactive Sentence for Action Config */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {action.type === "move_group" && (
          <>
            <span>move item to</span>
            <GroupPicker
              groups={groups}
              selectedId={action.config.to_group_id}
              onSelect={(id) => onChange({ config: { to_group_id: id } })}
              placeholder="group"
            />
          </>
        )}

        {action.type === "change_status" && (
          <>
            <span>set</span>
            <ColumnPicker
              columns={columns.filter((c) => c.type === "status")}
              selectedId={action.config.column_id}
              onSelect={(id) => onChange({ config: { ...action.config, column_id: id, value: undefined } })}
              placeholder="status column"
            />
            <span>to</span>
            {action.config.column_id && (
              <StatusLabelPicker
                column={columns.find((c) => c.id === action.config.column_id)}
                selectedId={action.config.value}
                onSelect={(id) => onChange({ config: { ...action.config, value: id } })}
                placeholder="value"
              />
            )}
          </>
        )}

        {action.type === "delete_item" && (
          <span className="text-rf-danger font-medium">delete this item</span>
        )}

        {action.type === "set_date" && (
          <>
            <span>set</span>
            <ColumnPicker
              columns={columns.filter((c) => c.type === "date")}
              selectedId={action.config.column_id}
              onSelect={(id) => onChange({ config: { ...action.config, column_id: id } })}
              placeholder="date column"
            />
            <span>to</span>
            <select
              value={action.config.value || ""}
              onChange={(e) => onChange({ config: { ...action.config, value: e.target.value } })}
              className="px-2 py-0.5 text-sm border border-rf-blue-tint rounded bg-rf-surface-card text-rf-blue font-medium"
            >
              <option value="">Choose...</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
            </select>
          </>
        )}

        {action.type === "set_number" && (
          <>
            <span>set</span>
            <ColumnPicker
              columns={columns.filter((c) => c.type === "number")}
              selectedId={action.config.column_id}
              onSelect={(id) => onChange({ config: { ...action.config, column_id: id } })}
              placeholder="number column"
            />
            <span>to</span>
            <input
              type="number"
              value={action.config.value || ""}
              onChange={(e) => onChange({ config: { ...action.config, value: parseFloat(e.target.value) } })}
              placeholder="0"
              className="w-20 px-2 py-0.5 text-sm border border-rf-blue-tint rounded bg-rf-surface-card text-rf-blue font-medium"
            />
          </>
        )}

        {action.type === "inc_dec" && (
          <>
            <select
              value={action.config.operation || ""}
              onChange={(e) => onChange({ config: { ...action.config, operation: e.target.value } })}
              className="px-2 py-0.5 text-sm border border-rf-blue-tint rounded bg-rf-surface-card text-rf-blue font-medium"
            >
              <option value="">Choose...</option>
              <option value="increment">Increase</option>
              <option value="decrement">Decrease</option>
            </select>
            <ColumnPicker
              columns={columns.filter((c) => c.type === "number")}
              selectedId={action.config.column_id}
              onSelect={(id) => onChange({ config: { ...action.config, column_id: id } })}
              placeholder="number column"
            />
            <span>by</span>
            <input
              type="number"
              value={action.config.amount || 1}
              onChange={(e) => onChange({ config: { ...action.config, amount: parseInt(e.target.value) } })}
              placeholder="1"
              className="w-16 px-2 py-0.5 text-sm border border-rf-blue-tint rounded bg-rf-surface-card text-rf-blue font-medium"
            />
          </>
        )}

        {action.type === "send_slack" && (
          <div className="w-full space-y-2">
            <input
              type="url"
              value={action.config.webhook_url || ""}
              onChange={(e) => onChange({ config: { ...action.config, webhook_url: e.target.value } })}
              placeholder="Slack webhook URL"
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
            <textarea
              value={action.config.message || ""}
              onChange={(e) => onChange({ config: { ...action.config, message: e.target.value } })}
              placeholder="Message (use {{applicant_id}} for variables)"
              className="w-full px-3 py-2 border border-gray-300 rounded"
              rows={2}
            />
          </div>
        )}

        {action.type === "send_email" && (
          <span className="text-gray-500 text-sm">(Email integration stub - configure in code)</span>
        )}

        {action.type === "email_gmail" && (
          <EmailGmailEditor
            companyId={companyId}
            action={action}
            columns={columns}
            onChange={onChange}
          />
        )}

        {action.type === "send_email_gmail" && (
          <SendEmailGmailAction
            companyId={companyId}
            accountId={accountId}
            action={action}
            columns={columns}
            onChange={onChange}
            triggerKey={triggerKey}
            triggerConfig={triggerConfig}
            filterConditions={filterConditions}
          />
        )}

        {action.type === "twilio.send_sms" && (
          <TwilioSmsAction
            companyId={companyId}
            action={action}
            columns={columns}
            onChange={onChange}
          />
        )}

        {action.type === "twilio.make_call_say" && (
          <TwilioCallAction
            companyId={companyId}
            action={action}
            columns={columns}
            onChange={onChange}
          />
        )}

        {action.type === "integration.set_field" && (
          <>
            <span>set FADV</span>
            <select
              value={action.config.field_key || ""}
              onChange={(e) =>
                onChange({
                  config: {
                    ...action.config,
                    provider: "fadv",
                    field_key: e.target.value,
                  },
                })
              }
              className="px-2 py-0.5 text-sm border border-rf-blue-tint rounded bg-rf-surface-card text-rf-blue font-medium"
            >
              <option value="">choose field…</option>
              {FADV_FIELD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span>to</span>
            <input
              type="text"
              value={action.config.value || ""}
              onChange={(e) =>
                onChange({ config: { ...action.config, value: e.target.value } })
              }
              placeholder="value…"
              className="px-2 py-0.5 text-sm border border-rf-blue-tint rounded bg-rf-surface-card text-rf-blue font-medium min-w-[120px]"
            />
          </>
        )}

        {action.type === "fadv.add_subject" && (
          <div className="w-full space-y-3 pt-1">
            {/* Package column */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-28 shrink-0">Package from</span>
              <ColumnPicker
                columns={columns.filter(
                  (c) => TEXT_COL_TYPES.includes(c.type) || c.type.startsWith("fadv.")
                )}
                selectedId={action.config.package_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, package_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Facility ID column */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-28 shrink-0">Facility ID from</span>
              <ColumnPicker
                columns={columns.filter(
                  (c) => TEXT_COL_TYPES.includes(c.type) || c.type.startsWith("fadv.")
                )}
                selectedId={action.config.facility_id_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, facility_id_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Position Type column */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-28 shrink-0">Position Type from</span>
              <ColumnPicker
                columns={columns.filter(
                  (c) => TEXT_COL_TYPES.includes(c.type) || c.type.startsWith("fadv.")
                )}
                selectedId={action.config.position_type_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, position_type_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* First Name column (optional — falls back to applicant record) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-28 shrink-0">First Name from</span>
              <ColumnPicker
                columns={columns.filter(
                  (c) => TEXT_COL_TYPES.includes(c.type) || c.type.startsWith("fadv.")
                )}
                selectedId={action.config.first_name_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, first_name_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Last Name column (optional — falls back to applicant record) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-28 shrink-0">Last Name from</span>
              <ColumnPicker
                columns={columns.filter(
                  (c) => TEXT_COL_TYPES.includes(c.type) || c.type.startsWith("fadv.")
                )}
                selectedId={action.config.last_name_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, last_name_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Email column (optional — falls back to applicant record) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-28 shrink-0">Email from</span>
              <ColumnPicker
                columns={columns.filter(
                  (c) => TEXT_COL_TYPES.includes(c.type) || c.type.startsWith("fadv.")
                )}
                selectedId={action.config.email_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, email_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Output column */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
              <span className="text-sm text-gray-500 w-28 shrink-0">Write result to</span>
              <ColumnPicker
                columns={columns.filter((c) => TEXT_COL_TYPES.includes(c.type))}
                selectedId={action.config.output_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, output_column_id: id } })
                }
                placeholder="output column"
              />
            </div>
          </div>
        )}

        {action.type === "lms.send_training_link" && (() => {
          const statusCol = columns.find((c) => c.id === action.config.status_column_id);
          const statusLabels = statusCol?.labels ?? [];
          const lmsVarGroups: VariableGroup[] = [
            {
              section: "Applicant info",
              items: [
                { label: "First Name", token: "{{first_name}}" },
                { label: "Full Name", token: "{{full_name}}" },
                { label: "Company Name", token: "{{company_name}}" },
              ],
            },
            ...(columns.length > 0
              ? [{ section: "Board columns", items: columns.map((c) => ({ label: c.name, token: `{{col:${slugifyColName(c.name)}}}` })) }]
              : []),
          ];
          return (
            <div className="w-full space-y-3 pt-1">
              {/* Course selector */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-700 w-36 shrink-0">Send course</span>
                <CoursePicker
                  courses={lmsCourses}
                  selectedId={action.config.course_id}
                  onSelect={(id) => onChange({ config: { ...action.config, course_id: id } })}
                />
              </div>

              {/* Email column — email or text columns */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-700 w-36 shrink-0">Get email from</span>
                <ColumnPicker
                  columns={columns.filter((c) => c.type === "email" || c.type === "text")}
                  selectedId={action.config.email_column_id}
                  onSelect={(id) => onChange({ config: { ...action.config, email_column_id: id } })}
                  placeholder="auto-detect"
                />
              </div>

              {/* Status column + label pickers */}
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-700 w-36 shrink-0">Write status to</span>
                  <ColumnPicker
                    columns={columns.filter((c) => c.type === "status")}
                    selectedId={action.config.status_column_id}
                    onSelect={(id) => onChange({ config: {
                      ...action.config, status_column_id: id,
                      link_sent_label_id: undefined,
                      in_progress_label_id: undefined,
                      passed_label_id: undefined,
                      failed_label_id: undefined,
                    }})}
                    placeholder="status column (optional)"
                  />
                </div>
                {statusLabels.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-gray-400 w-36 shrink-0">↳ Link sent label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.link_sent_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, link_sent_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-gray-400 w-36 shrink-0">↳ In progress label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.in_progress_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, in_progress_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-gray-400 w-36 shrink-0">↳ Passed label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.passed_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, passed_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-gray-400 w-36 shrink-0">↳ Failed label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.failed_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, failed_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                  </>
                )}
              </div>

              {/* Email customization */}
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="text-sm text-gray-700 w-36 shrink-0 pt-1.5">Email subject</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-end mb-1">
                      <VariablePickerButton
                        groups={lmsVarGroups}
                        fieldRef={lmsSubjectRef}
                        value={action.config.custom_subject ?? ""}
                        onChange={(newVal) => onChange({ config: { ...action.config, custom_subject: newVal || undefined } })}
                      />
                    </div>
                    <input
                      ref={lmsSubjectRef}
                      type="text"
                      value={action.config.custom_subject ?? ""}
                      onChange={(e) => onChange({ config: { ...action.config, custom_subject: e.target.value || undefined } })}
                      placeholder="Action required: Complete your safety training"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <span className="text-sm text-gray-700 w-36 shrink-0 pt-1.5">Email message</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-end mb-1">
                      <VariablePickerButton
                        groups={lmsVarGroups}
                        fieldRef={lmsMessageRef}
                        value={action.config.custom_message ?? ""}
                        onChange={(newVal) => onChange({ config: { ...action.config, custom_message: newVal || undefined } })}
                      />
                    </div>
                    <textarea
                      ref={lmsMessageRef}
                      value={action.config.custom_message ?? ""}
                      onChange={(e) => onChange({ config: { ...action.config, custom_message: e.target.value || undefined } })}
                      placeholder={`Hi {{first_name}}, please complete your required training before your start date.`}
                      rows={3}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    />
                  </div>
                </div>
              </div>

              {/* Output column — text only */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
                <span className="text-sm text-gray-500 w-36 shrink-0">Write progress to</span>
                <ColumnPicker
                  columns={columns.filter((c) => c.type === "text")}
                  selectedId={action.config.output_column_id}
                  onSelect={(id) => onChange({ config: { ...action.config, output_column_id: id } })}
                  placeholder="text column (optional)"
                />
              </div>
            </div>
          );
        })()}

        {action.type === "portal.send_link" && (() => {
          const portalVarGroups: VariableGroup[] = [
            {
              section: "Applicant info",
              items: [
                { label: "First Name", token: "{{first_name}}" },
                { label: "Full Name", token: "{{full_name}}" },
                { label: "Company Name", token: "{{company_name}}" },
                { label: "Portal Link", token: "{{portal_link}}" },
              ],
            },
            ...(columns.length > 0
              ? [{ section: "Board columns", items: columns.map((c) => ({ label: c.name, token: `{{col:${slugifyColName(c.name)}}}` })) }]
              : []),
          ];
          return (
          <div className="w-full space-y-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-36 shrink-0">Get email from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "email" || c.type === "text")}
                selectedId={action.config.email_column_id}
                onSelect={(id) => onChange({ config: { ...action.config, email_column_id: id } })}
                placeholder="auto-detect"
              />
            </div>

            {/* Email customization */}
            <div className="space-y-2 pt-1 border-t border-gray-100">
              <div className="flex flex-wrap items-start gap-2">
                <span className="text-sm text-gray-700 w-36 shrink-0 pt-1.5">Email subject</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-end mb-1">
                    <VariablePickerButton
                      groups={portalVarGroups}
                      fieldRef={portalSubjectRef}
                      value={action.config.custom_subject ?? ""}
                      onChange={(newVal) => onChange({ config: { ...action.config, custom_subject: newVal || undefined } })}
                    />
                  </div>
                  <input
                    ref={portalSubjectRef}
                    type="text"
                    value={action.config.custom_subject ?? ""}
                    onChange={(e) => onChange({ config: { ...action.config, custom_subject: e.target.value || undefined } })}
                    placeholder="Your application status"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <span className="text-sm text-gray-700 w-36 shrink-0 pt-1.5">Email message</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-end mb-1">
                    <VariablePickerButton
                      groups={portalVarGroups}
                      fieldRef={portalMessageRef}
                      value={action.config.custom_message ?? ""}
                      onChange={(newVal) => onChange({ config: { ...action.config, custom_message: newVal || undefined } })}
                    />
                  </div>
                  <textarea
                    ref={portalMessageRef}
                    value={action.config.custom_message ?? ""}
                    onChange={(e) => onChange({ config: { ...action.config, custom_message: e.target.value || undefined } })}
                    placeholder={`Hi {{first_name}}, use the link below to check your application status.`}
                    rows={3}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {action.type === "safety_trainer.submit" && (
          <div className="w-full space-y-3 pt-1">
            {/* Driver FedEx ID column — text or number only */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-36 shrink-0">Driver FedEx ID from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "text" || c.type === "number")}
                selectedId={action.config.driver_fedex_id_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, driver_fedex_id_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Stage 1 Start Date column — date only */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-36 shrink-0">Stage 1 Start Date from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "date")}
                selectedId={action.config.start_date_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, start_date_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Stage 1 Completion Date column — date only */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-36 shrink-0">Completion Date from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "date")}
                selectedId={action.config.completion_date_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, completion_date_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Contract Number column — text or number */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-36 shrink-0">Contract Number from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "text" || c.type === "number")}
                selectedId={action.config.contract_number_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, contract_number_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Output column — text only */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
              <span className="text-sm text-gray-500 w-36 shrink-0">Write result to</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "text")}
                selectedId={action.config.output_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, output_column_id: id } })
                }
                placeholder="output column"
              />
            </div>
          </div>
        )}

        {action.type === "ai.score_resume" && (
          <div className="w-full space-y-3 pt-1">
            {/* Resume file column (optional) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-32 shrink-0">Resume from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "file")}
                selectedId={action.config.file_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, file_column_id: id } })
                }
                placeholder="file column (optional)"
              />
            </div>
            <p className="text-xs text-gray-400 ml-32">
              Optional. Falls back to the applicant&apos;s uploaded resume if left empty.
            </p>

            {/* Score output column (required) — number type only */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-32 shrink-0">Write score to</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "number")}
                selectedId={action.config.score_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, score_column_id: id } })
                }
                placeholder="number column"
              />
            </div>

            {/* Feedback output column (required) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 w-32 shrink-0">Write feedback to</span>
              <ColumnPicker
                columns={columns.filter((c) => TEXT_COL_TYPES.includes(c.type))}
                selectedId={action.config.feedback_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, feedback_column_id: id } })
                }
                placeholder="feedback column"
              />
            </div>

            {/* Criteria prompt (required) */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-700">Scoring criteria</span>
              <textarea
                value={action.config.criteria || ""}
                onChange={(e) =>
                  onChange({ config: { ...action.config, criteria: e.target.value } })
                }
                placeholder={"Describe what to evaluate, e.g.:\n- CDL Class A license required\n- 2+ years delivery experience preferred\n- Clean driving record\n- Score 1-10, where 8+ is a strong candidate"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-rf-blue min-h-[100px] resize-y"
                rows={5}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Action Type Picker (Searchable Popover)
// ============================================================================

const ACTION_CATEGORIES = [
  {
    label: "Move & Organize",
    actions: [
      { value: "move_group", label: "Move to group", icon: ArrowRight },
      { value: "change_status", label: "Change status", icon: RefreshCw },
      { value: "delete_item", label: "Delete item", icon: Trash2 },
      { value: "set_date", label: "Set date", icon: Calendar },
      { value: "set_number", label: "Set number", icon: Hash },
      { value: "inc_dec", label: "Increase / decrease", icon: TrendingUp },
    ],
  },
  {
    label: "Communicate",
    actions: [
      { value: "send_email_gmail", label: "Send email (Gmail)", icon: Mail },
      { value: "send_slack", label: "Send Slack notification", icon: MessageSquare },
      { value: "twilio.send_sms", label: "Send SMS", icon: Phone },
      { value: "twilio.make_call_say", label: "Call and say", icon: PhoneCall },
      { value: "portal.send_link", label: "Send portal link", icon: ExternalLink },
      { value: "lms.send_training_link", label: "Send training link", icon: GraduationCap },
    ],
  },
  {
    label: "Integrations",
    actions: [
      { value: "integration.set_field", label: "Set FADV field", icon: Settings },
      { value: "fadv.add_subject", label: "Submit to First Advantage", icon: Shield },
      { value: "safety_trainer.submit", label: "Submit Safety Cert", icon: Award },
    ],
  },
  {
    label: "AI",
    actions: [
      { value: "ai.score_resume", label: "Score resume with AI", icon: Brain },
    ],
  },
];

function ActionTypePicker({ onSelect }: { onSelect: (type: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = ACTION_CATEGORIES.map((cat) => ({
    ...cat,
    actions: cat.actions.filter((a) =>
      a.label.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) => cat.actions.length > 0);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-green-400 hover:text-rf-success transition-colors flex items-center justify-center gap-1.5 text-sm"
      >
        <Plus className="w-4 h-4" />
        Add action
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setIsOpen(false); setSearch(""); }} />
          <div className="absolute z-20 left-0 right-0 mt-2 bg-rf-surface-card border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col">
            {/* Search */}
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search actions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-green-400"
                  autoFocus
                />
              </div>
            </div>

            {/* Categories */}
            <div className="overflow-y-auto">
              {filtered.map((cat) => (
                <div key={cat.label}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
                    {cat.label}
                  </div>
                  {cat.actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.value}
                        onClick={() => {
                          onSelect(action.value);
                          setIsOpen(false);
                          setSearch("");
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-rf-success-bg transition-colors flex items-center gap-2.5 text-sm"
                      >
                        <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="text-gray-800">{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">No matching actions</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ActionTypeLabel({
  type,
  actionTypes,
  onChange,
}: {
  type: string;
  actionTypes: Array<{ value: string; label: string }>;
  onChange: (type: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const current = actionTypes.find((t) => t.value === type);

  const filtered = ACTION_CATEGORIES.map((cat) => ({
    ...cat,
    actions: cat.actions.filter((a) =>
      a.label.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) => cat.actions.length > 0);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs font-medium text-rf-success hover:text-green-900 hover:bg-rf-success-bg px-2 py-0.5 rounded transition-colors flex items-center gap-1"
      >
        {current?.label || type}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setIsOpen(false); setSearch(""); }} />
          <div className="absolute z-20 left-0 mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-xl max-h-72 w-64 overflow-hidden flex flex-col">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search actions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-green-400"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto">
              {filtered.map((cat) => (
                <div key={cat.label}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
                    {cat.label}
                  </div>
                  {cat.actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.value}
                        onClick={() => {
                          onChange(action.value);
                          setIsOpen(false);
                          setSearch("");
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-rf-success-bg transition-colors flex items-center gap-2.5 text-sm ${
                          action.value === type ? "bg-rf-success-bg text-rf-success" : ""
                        }`}
                      >
                        <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">No matching actions</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Reusable Picker Components
// ============================================================================

function ColumnPicker({
  columns,
  selectedId,
  onSelect,
  placeholder,
  extraOptions,
}: {
  columns: Column[];
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholder: string;
  extraOptions?: Array<{ id: string; name: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected =
    columns.find((c) => c.id === selectedId) ??
    extraOptions?.find((o) => o.id === selectedId);

  const q = search.toLowerCase();
  const filteredColumns = q
    ? columns.filter((c) => c.name.toLowerCase().includes(q))
    : columns;
  const filteredExtra = q
    ? (extraOptions ?? []).filter((o) => o.name.toLowerCase().includes(q))
    : (extraOptions ?? []);

  function close() {
    setIsOpen(false);
    setSearch("");
  }

  useEffect(() => {
    if (isOpen) {
      // Tiny delay so the input is mounted before focusing
      setTimeout(() => searchRef.current?.focus(), 10);
    }
  }, [isOpen]);

  return (
    <div className="relative inline-block">
      {/* Backdrop */}
      {isOpen && <div className="fixed inset-0 z-10" onClick={close} />}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-0.5 border border-rf-blue-tint bg-rf-blue-tint/70 rounded text-rf-blue font-medium text-sm hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-0.5"
      >
        {selected ? selected.name : placeholder}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg min-w-[200px]">
          {/* Search input */}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-gray-100">
            <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                if (e.key === "Enter" && filteredColumns.length === 1) {
                  onSelect(filteredColumns[0].id);
                  close();
                }
              }}
              placeholder="Search columns…"
              className="w-full text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
            />
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filteredColumns.map((col) => (
              <button
                key={col.id}
                onClick={() => { onSelect(col.id); close(); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-gray-100 last:border-b-0"
              >
                {col.name}
              </button>
            ))}
            {filteredExtra.map((opt) => (
              <button
                key={opt.id}
                onClick={() => { onSelect(opt.id); close(); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-gray-100 last:border-b-0 text-gray-500 italic"
              >
                {opt.name}
              </button>
            ))}
            {filteredColumns.length === 0 && filteredExtra.length === 0 && (
              <div className="px-3 py-2 text-gray-400 text-xs">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LabelPicker({
  labels,
  selectedId,
  onSelect,
  placeholder,
}: {
  labels: Array<{ id: string; label: string; color: string }>;
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = labels.find((l) => l.id === selectedId);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-0.5 border border-rf-blue-tint bg-rf-blue-tint/70 rounded text-rf-blue font-medium text-sm hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-1"
      >
        {selected ? (
          <>
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: selected.color || "#94a3b8" }}
            />
            {selected.label}
          </>
        ) : placeholder}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg min-w-[160px] max-h-52 overflow-y-auto">
          {labels.map((lbl) => (
            <button
              key={lbl.id}
              onClick={() => { onSelect(lbl.id); setIsOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-gray-100 last:border-b-0 flex items-center gap-1.5"
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: lbl.color || "#94a3b8" }}
              />
              {lbl.label}
            </button>
          ))}
          {labels.length === 0 && (
            <div className="px-3 py-1.5 text-gray-500 text-xs">No labels available</div>
          )}
        </div>
      )}
    </div>
  );
}

function CoursePicker({
  courses,
  selectedId,
  onSelect,
}: {
  courses: { id: string; name: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = courses.find((c) => c.id === selectedId);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-0.5 border border-rf-blue-tint bg-rf-blue-tint/70 rounded text-rf-blue font-medium text-sm hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-0.5"
      >
        {selected ? selected.name : "choose course"}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg min-w-[220px] max-h-52 overflow-y-auto">
          {courses.map((course) => (
            <button
              key={course.id}
              onClick={() => {
                onSelect(course.id);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-gray-100 last:border-b-0"
            >
              {course.name}
            </button>
          ))}
          {courses.length === 0 && (
            <div className="px-3 py-1.5 text-gray-500 text-xs">
              No published courses — create and publish a course in Training first
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Variables available for email customization in LMS / portal actions
interface VariableItem { label: string; token: string }
interface VariableGroup { section: string; items: VariableItem[] }

/** Slugify a column name for use in template tokens: "FedEx ID" → "fedex_id" */
function slugifyColName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * A "+ Add variable" button that inserts the chosen token at the current cursor
 * position of the associated input/textarea (via `fieldRef`).
 */
function VariablePickerButton({
  groups,
  fieldRef,
  value,
  onChange,
}: {
  groups: VariableGroup[];
  fieldRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>;
  value: string;
  onChange: (newValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleInsert(token: string) {
    const el = fieldRef.current;
    const start = el?.selectionStart ?? value.length;
    const end   = el?.selectionEnd   ?? value.length;
    const newValue = value.slice(0, start) + token + value.slice(end);
    onChange(newValue);
    // Restore cursor after React re-renders the controlled input
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      }
    });
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        <Plus className="w-3 h-3" />
        Add variable
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-60 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.section}>
              <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 sticky top-0">
                {group.section}
              </div>
              {group.items.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => handleInsert(v.token)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center justify-between gap-2"
                >
                  <span className="text-gray-700 truncate">{v.label}</span>
                  {/* Show code hint only for short built-in tokens; slugs are readable enough */}
                  {v.token.length <= 20 && (
                    <code className="text-gray-400 text-xs bg-gray-100 px-1 rounded shrink-0">{v.token}</code>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusLabelPicker({
  column,
  selectedId,
  onSelect,
  placeholder,
}: {
  column?: Column;
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const labels = column?.labels || [];
  const selected = labels.find((l) => l.id === selectedId);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-0.5 border border-rf-blue-tint bg-rf-blue-tint/70 rounded text-rf-blue font-medium text-sm hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-0.5"
      >
        {selected ? selected.label : placeholder}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg min-w-[140px] max-h-52 overflow-y-auto">
          {labels.map((label) => (
            <button
              key={label.id}
              onClick={() => {
                onSelect(label.id);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-gray-100 last:border-b-0 flex items-center gap-1.5"
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.label}
            </button>
          ))}
          {labels.length === 0 && (
            <div className="px-3 py-1.5 text-gray-500 text-xs">No labels available</div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupPicker({
  groups,
  selectedId,
  onSelect,
  placeholder,
  allowAny = false,
}: {
  groups: Group[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  placeholder: string;
  allowAny?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = groups.find((g) => g.id === selectedId);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-0.5 border border-rf-blue-tint bg-rf-blue-tint/70 rounded text-rf-blue font-medium text-sm hover:bg-rf-blue-tint transition-colors inline-flex items-center gap-0.5"
      >
        {selected ? selected.name : selectedId === undefined && allowAny ? "any group" : placeholder}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg min-w-[140px] max-h-52 overflow-y-auto">
          {allowAny && (
            <button
              onClick={() => {
                onSelect(undefined);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-gray-100"
            >
              <span className="text-gray-500 italic">Any group</span>
            </button>
          )}
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => {
                onSelect(group.id);
                setIsOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-rf-blue-tint transition-colors border-b border-gray-100 last:border-b-0 flex items-center gap-1.5"
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              {group.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
