"use client";

import { useState, useEffect } from "react";
import { Plus, X, ChevronDown, Zap } from "lucide-react";
import { createJobAutomation, updateJobAutomation, getJobBoardColumns } from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";
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

const CONDITION_TYPES = [
  { value: "status_is",     label: "Status is",        colType: "status" as const },
  { value: "status_is_not", label: "Status is not",    colType: "status" as const },
  { value: "text_contains", label: "Text contains",    colType: "text"   as const },
  { value: "text_equals",   label: "Text equals",      colType: "text"   as const },
  { value: "number_eq",     label: "Number =",         colType: "number" as const },
  { value: "number_gt",     label: "Number >",         colType: "number" as const },
  { value: "number_gte",    label: "Number ≥",         colType: "number" as const },
  { value: "number_lt",     label: "Number <",         colType: "number" as const },
  { value: "number_lte",    label: "Number ≤",         colType: "number" as const },
  { value: "date_is",       label: "Date is",          colType: "date"   as const },
  { value: "date_before",   label: "Date before",      colType: "date"   as const },
  { value: "date_after",    label: "Date after",       colType: "date"   as const },
  { value: "item_in_group", label: "Item is in group", colType: null },
] as const;

// Text-like column types that store their value in value_text
const TEXT_COL_TYPES = ["text", "email", "phone", "location"];

// Human-readable operator label for each condition type
function conditionOpLabel(type: string): string {
  const map: Record<string, string> = {
    status_is: "is", status_is_not: "is not",
    text_equals: "equals", text_contains: "contains",
    number_eq: "=", number_gt: ">", number_gte: "≥", number_lt: "<", number_lte: "≤",
    date_is: "is", date_before: "before", date_after: "after",
    item_in_group: "in group",
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
}: CreateTabProps) {
  const [selectedTrigger, setSelectedTrigger] = useState<Trigger | null>(null);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<Column[]>([]);
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);

  const isEditing = !!editingAutomation;

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
        default:
          return action.type;
      }
    });

    // Build condition summary for valid conditions
    const validConditions = filterConditions.filter((c) =>
      c.type === "item_in_group" ? c.value !== "" : c.column_id && c.value !== ""
    );
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
      return `${col.name} ${conditionOpLabel(cond.type)} ${valueDisplay}`;
    }).filter(Boolean);

    const conditionSuffix = conditionTexts.length > 0
      ? ` AND only if ${conditionTexts.join(" AND ")}`
      : "";

    return `When ${triggerText}${conditionSuffix} → ${actionTexts.join(" and ")}`;
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      {/* Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-purple-100 px-4 py-2 rounded-full">
          <Zap className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium text-purple-900">
            {isEditing ? "Edit Automation Recipe" : "Create Automation Recipe"}
          </span>
        </div>
      </div>

      {/* Recipe Builder */}
      <div className="space-y-8">
        {/* WHEN THIS HAPPENS */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
            When this happens...
          </h3>

          {/* Trigger Selector */}
          <TriggerSelector
            triggers={triggers}
            selectedTrigger={selectedTrigger}
            onSelect={setSelectedTrigger}
            triggerConfig={triggerConfig}
            onConfigChange={setTriggerConfig}
            columns={columns}
            groups={groups}
          />
        </div>

        {/* AND ONLY IF — optional filter conditions */}
        {selectedTrigger && (
          <FilterConditionsEditor
            conditions={filterConditions}
            columns={columns}
            groups={groups}
            onChange={setFilterConditions}
          />
        )}

        {/* Arrow */}
        {selectedTrigger && (
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>
        )}

        {/* THEN DO THIS */}
        {selectedTrigger && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
              Then do this...
            </h3>

            <div className="space-y-3">
              {actions.map((action, index) => (
                <ActionEditor
                  key={index}
                  action={action}
                  index={index}
                  columns={columns}
                  groups={groups}
                  companyId={companyId}
                  accountId={accountId}
                  onChange={(updates) => updateAction(index, updates)}
                  onRemove={() => removeAction(index)}
                />
              ))}

              {actions.length < 5 && (
                <button
                  onClick={addAction}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2 font-medium"
                >
                  <Plus className="w-5 h-5" />
                  Add action
                </button>
              )}
            </div>
          </div>
        )}

        {/* Create/Update Buttons */}
        {selectedTrigger && actions.length > 0 && (
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-6">
            {isEditing && onCancelEdit && (
              <button
                onClick={onCancelEdit}
                disabled={loading}
                className="px-8 py-3 min-h-[44px] bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 font-medium"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleCreate}
              disabled={loading}
              className="px-8 py-3 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium shadow-lg"
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

        {/* Recipe Preview */}
        {selectedTrigger && actions.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
            <span className="font-medium text-gray-900">Recipe: </span>
            {buildRecipeName()}
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
}: {
  triggers: Trigger[];
  selectedTrigger: Trigger | null;
  onSelect: (trigger: Trigger | null) => void;
  triggerConfig: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  columns: Column[];
  groups: Group[];
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
          className="w-full px-6 py-4 border-2 border-gray-300 rounded-lg text-left flex items-center justify-between hover:border-blue-400 transition-colors bg-white"
        >
          <span className="text-gray-500">Choose a trigger...</span>
          <ChevronDown className="w-5 h-5 text-gray-400" />
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
            {sortedTriggers.map((trigger) => (
              <button
                key={trigger.id}
                onClick={() => {
                  onSelect(trigger);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <p className="font-medium text-gray-900">{trigger.name}</p>
                {trigger.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{trigger.description}</p>
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
    <div className="border-2 border-blue-300 bg-blue-50 rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-blue-600 font-medium mb-2">Trigger</p>

          {/* Interactive Sentence */}
          {selectedTrigger.key === "board.status_changes_to" && (
            <div className="flex flex-wrap items-center gap-2 text-lg">
              <span>When</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "status")}
                selectedId={triggerConfig.column_id}
                onSelect={(id) => onConfigChange({ ...triggerConfig, column_id: id, changes_to: undefined })}
                placeholder="status column"
              />
              <span>changes to</span>
              {triggerConfig.column_id && (
                <StatusLabelPicker
                  column={columns.find((c) => c.id === triggerConfig.column_id)}
                  selectedId={triggerConfig.changes_to}
                  onSelect={(id) => onConfigChange({ ...triggerConfig, changes_to: id })}
                  placeholder="value"
                />
              )}
            </div>
          )}

          {selectedTrigger.key === "applicant.moved_group" && (
            <div className="flex flex-wrap items-center gap-2 text-lg">
              <span>When applicant moved to</span>
              <GroupPicker
                groups={groups}
                selectedId={triggerConfig.to_group_id}
                onSelect={(id) => onConfigChange({ ...triggerConfig, to_group_id: id })}
                placeholder="group"
                allowAny
              />
            </div>
          )}

          {selectedTrigger.key === "applicant.created" && (
            <div className="text-lg">
              <span>When applicant is created</span>
            </div>
          )}

          {selectedTrigger.key === "form.submitted" && (
            <div className="text-lg">
              <span>When application form is submitted</span>
            </div>
          )}
        </div>

        <button
          onClick={() => onSelect(null)}
          className="p-1 hover:bg-blue-100 rounded ml-4"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Filter Conditions Editor ("and only if…")
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
          className="text-sm text-gray-400 hover:text-amber-600 transition-colors flex items-center gap-1.5 px-4 py-2 border border-dashed border-gray-300 rounded-lg hover:border-amber-300 hover:bg-amber-50/30"
        >
          <Plus className="w-3.5 h-3.5" />
          and only if… (optional filter)
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-amber-200 bg-amber-50/40 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-amber-700">and only if…</span>
        <button
          onClick={addCondition}
          className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 transition-colors"
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
  const condInfo = CONDITION_TYPES.find((t) => t.value === condition.type);
  const isGroupCondition = condition.type === "item_in_group";

  // Filter columns to only those relevant to the condition type
  const relevantColumns = isGroupCondition
    ? []
    : columns.filter((c) => {
        if (!condInfo?.colType) return false;
        if (condInfo.colType === "text") return TEXT_COL_TYPES.includes(c.type);
        return c.type === condInfo.colType;
      });

  const selectedColumn = columns.find((c) => c.id === condition.column_id);
  const isStatusCondition = condition.type === "status_is" || condition.type === "status_is_not";
  const isTextCondition   = condition.type === "text_equals" || condition.type === "text_contains";
  const isNumberCondition = condition.type.startsWith("number_");
  const isDateCondition   = condition.type.startsWith("date_");

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
      {/* Condition type selector */}
      <select
        value={condition.type}
        onChange={(e) => onChange({ type: e.target.value, column_id: undefined, value: "" })}
        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
      >
        {CONDITION_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {/* Column picker (not shown for item_in_group) */}
      {!isGroupCondition && (
        <ColumnPicker
          columns={relevantColumns}
          selectedId={condition.column_id}
          onSelect={(id) => onChange({ column_id: id, value: "" })}
          placeholder="column"
        />
      )}

      {/* Value input — varies by condition type */}
      {isGroupCondition && (
        <GroupPicker
          groups={groups}
          selectedId={typeof condition.value === "string" ? condition.value : undefined}
          onSelect={(id) => onChange({ value: id ?? "" })}
          placeholder="group"
        />
      )}

      {isStatusCondition && condition.column_id && (
        <StatusLabelPicker
          column={selectedColumn}
          selectedId={typeof condition.value === "string" ? condition.value : undefined}
          onSelect={(id) => onChange({ value: id })}
          placeholder="value"
        />
      )}

      {isTextCondition && (
        <input
          type="text"
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="value…"
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white min-w-[120px] focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
      )}

      {isNumberCondition && (
        <input
          type="number"
          value={condition.value === "" ? "" : condition.value}
          onChange={(e) =>
            onChange({ value: e.target.value === "" ? "" : parseFloat(e.target.value) })
          }
          placeholder="0"
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white w-24 focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
      )}

      {isDateCondition && (
        <input
          type="date"
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onChange({ value: e.target.value })}
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="ml-auto p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
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
  companyId,
  accountId,
  onChange,
  onRemove,
}: {
  action: Action;
  index: number;
  columns: Column[];
  groups: Group[];
  companyId: string;
  accountId: string;
  onChange: (updates: Partial<Action>) => void;
  onRemove: () => void;
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
  ];

  const FADV_FIELD_OPTIONS = [
    { value: "package",       label: "Package" },
    { value: "location",      label: "Location" },
    { value: "facility_id",   label: "Facility ID" },
    { value: "position_type", label: "Position Type" },
  ];

  return (
    <div className="border-2 border-gray-300 rounded-lg p-6 bg-white">
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-medium text-gray-500">Action {index + 1}</span>
        <button
          onClick={onRemove}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Action Type Selector */}
      <select
        value={action.type}
        onChange={(e) => onChange({ type: e.target.value, config: {} })}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 font-medium"
      >
        {actionTypes.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>

      {/* Interactive Sentence for Action Config */}
      <div className="flex flex-wrap items-center gap-2 text-base">
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
          <span className="text-red-600 font-medium">delete this item</span>
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
              className="px-3 py-1.5 border border-blue-300 rounded bg-white text-blue-700 font-medium"
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
              className="w-24 px-3 py-1.5 border border-blue-300 rounded bg-white text-blue-700 font-medium"
            />
          </>
        )}

        {action.type === "inc_dec" && (
          <>
            <select
              value={action.config.operation || ""}
              onChange={(e) => onChange({ config: { ...action.config, operation: e.target.value } })}
              className="px-3 py-1.5 border border-blue-300 rounded bg-white text-blue-700 font-medium"
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
              className="w-20 px-3 py-1.5 border border-blue-300 rounded bg-white text-blue-700 font-medium"
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
              className="px-3 py-1.5 border border-blue-300 rounded bg-white text-blue-700 font-medium"
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
              className="px-3 py-1.5 border border-blue-300 rounded bg-white text-blue-700 font-medium min-w-[140px]"
            />
          </>
        )}
      </div>
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
}: {
  columns: Column[];
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = columns.find((c) => c.id === selectedId);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 border-2 border-blue-400 bg-blue-100 rounded text-blue-700 font-semibold hover:bg-blue-200 transition-colors inline-flex items-center gap-1"
      >
        {selected ? selected.name : placeholder}
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] max-h-60 overflow-y-auto">
          {columns.map((col) => (
            <button
              key={col.id}
              onClick={() => {
                onSelect(col.id);
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              {col.name}
            </button>
          ))}
          {columns.length === 0 && (
            <div className="px-3 py-2 text-gray-500 text-sm">No columns available</div>
          )}
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
        className="px-3 py-1.5 border-2 border-blue-400 bg-blue-100 rounded text-blue-700 font-semibold hover:bg-blue-200 transition-colors inline-flex items-center gap-1"
      >
        {selected ? selected.label : placeholder}
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[150px] max-h-60 overflow-y-auto">
          {labels.map((label) => (
            <button
              key={label.id}
              onClick={() => {
                onSelect(label.id);
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 flex items-center gap-2"
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.label}
            </button>
          ))}
          {labels.length === 0 && (
            <div className="px-3 py-2 text-gray-500 text-sm">No labels available</div>
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
        className="px-3 py-1.5 border-2 border-blue-400 bg-blue-100 rounded text-blue-700 font-semibold hover:bg-blue-200 transition-colors inline-flex items-center gap-1"
      >
        {selected ? selected.name : selectedId === undefined && allowAny ? "any group" : placeholder}
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[150px] max-h-60 overflow-y-auto">
          {allowAny && (
            <button
              onClick={() => {
                onSelect(undefined);
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors border-b border-gray-100"
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
              className="w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 flex items-center gap-2"
            >
              <div
                className="w-3 h-3 rounded-full"
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
