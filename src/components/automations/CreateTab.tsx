"use client";

import { useState, useEffect, useRef } from "react";
import { createJobAutomation, updateJobAutomation, getJobBoardColumns, getLmsCoursesForCompany } from "@/app/dashboard/[companyId]/jobs/[jobId]/automations/actions";
import { useToast } from "@/components/ui/toast-provider";
import type { Trigger, Group, Column, Action, FilterCondition } from "./automations-types";
import { TEXT_COL_TYPES, conditionOpLabel, parseSimplePattern } from "./automations-types";
import { TriggerSelector } from "./TriggerSelector";
import { ActionEditor } from "./ActionEditor";
import { ActionTypePicker } from "./ActionTypePicker";

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
  const toast = useToast();
  const [selectedTrigger, setSelectedTrigger] = useState<Trigger | null>(null);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<Column[]>([]);
  const [lmsCourses, setLmsCourses] = useState<{ id: string; name: string }[]>([]);
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  // For Gmail body-extract: true = show raw regex input, false = friendly "value comes after" input
  const [bodyExtractAdvanced, setBodyExtractAdvanced] = useState(false);

  const isEditing = !!editingAutomation;

  // Ref used to suppress the dirty-state signal that fires immediately after
  // the pre-fill effect loads existing automation data.  Without this, the
  // overlay would show "Discard unsaved changes?" even when nothing was edited.
  const justPreFilled = useRef(false);

  // Track dirty state for unsaved changes guard
  useEffect(() => {
    // Swallow the first dirty check that fires right after pre-filling the form
    // with an existing automation — that state change is not a user edit.
    if (justPreFilled.current) {
      justPreFilled.current = false;
      onDirtyChange?.(false);
      return;
    }
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
      // Signal the dirty-state effect to skip the next check — the state
      // updates below are a programmatic pre-fill, not a user interaction.
      justPreFilled.current = true;

      // Find the trigger
      const trigger = triggers.find((t) => t.key === editingAutomation.trigger_key);
      setSelectedTrigger(trigger || null);

      // Separate trigger-config keys from the "and only if…" conditions array
      const { conditions: savedConditions, ...triggerConfigOnly } = editingAutomation.filter || {};
      setTriggerConfig(triggerConfigOnly || {});

      // If the saved body_extract_pattern isn't parseable as a simple prefix pattern,
      // open the advanced regex editor so the user can see/edit it directly.
      const savedPattern = (triggerConfigOnly as any)?.body_extract_pattern;
      if (savedPattern && parseSimplePattern(savedPattern) === null) {
        setBodyExtractAdvanced(true);
      } else {
        setBodyExtractAdvanced(false);
      }
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
    setBodyExtractAdvanced(false);
  };

  const addAction = () => {
    if (actions.length >= 5) {
      toast.error("Maximum 5 actions per automation");
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
      toast.error("Please select a trigger");
      return;
    }

    if (actions.length === 0) {
      toast.error("Please add at least one action");
      return;
    }

    // Validate trigger config
    if (selectedTrigger.key === "board.status_changes_to") {
      if (!triggerConfig.column_id || !triggerConfig.changes_to) {
        toast.error("Please select a status column and value");
        return;
      }
    }
    if (selectedTrigger.key === "gmail.email_received") {
      if (!triggerConfig.match_applicant_by) {
        toast.error("Please select how to match emails to applicants");
        return;
      }
      if (triggerConfig.match_applicant_by === "body_extract" && !triggerConfig.body_extract_pattern) {
        toast.error("Please enter a body pattern to extract values from emails");
        return;
      }
    }

    // Validate actions
    for (const action of actions) {
      if (action.type === "move_group" && !action.config.to_group_id) {
        toast.error("Please select a target group for 'Move to group' action");
        return;
      }
      if (action.type === "change_status" && (!action.config.column_id || !action.config.value)) {
        toast.error("Please select a column and value for 'Change status' action");
        return;
      }
      if (action.type === "set_date" && (!action.config.column_id || !action.config.value)) {
        toast.error("Please select a column and value for 'Set date' action");
        return;
      }
      if (action.type === "set_number" && (!action.config.column_id || action.config.value === undefined)) {
        toast.error("Please select a column and value for 'Set number' action");
        return;
      }
      if (action.type === "inc_dec" && (!action.config.column_id || !action.config.operation)) {
        toast.error("Please configure 'Increment/Decrement' action");
        return;
      }
      if (action.type === "send_slack" && (!action.config.webhook_url || !action.config.message)) {
        toast.error("Please enter Slack webhook URL and message");
        return;
      }
      if (action.type === "email_gmail") {
        if (!action.config.gmail_connection_id || !action.config.recipient_column_id || !action.config.subject || !action.config.body) {
          toast.error("Please configure all Gmail email fields");
          return;
        }
      }
      if (action.type === "send_email_gmail") {
        if (!action.config.connection_id || !action.config.recipient_column_id || !action.config.subject) {
          toast.error("Please configure Gmail account, recipient, and subject");
          return;
        }
      }
      if (action.type === "twilio.send_sms") {
        const ts = action.config.toSource;
        if (!ts || (ts.type === "column" && !ts.columnId) || (ts.type === "manual" && !ts.value)) {
          toast.error("Please configure the recipient for Send SMS");
          return;
        }
        if (!action.config.message) {
          toast.error("Please enter a message for Send SMS");
          return;
        }
      }
      if (action.type === "twilio.make_call_say") {
        const ts = action.config.toSource;
        if (!ts || (ts.type === "column" && !ts.columnId) || (ts.type === "manual" && !ts.value)) {
          toast.error("Please configure the recipient for Call Someone and Say");
          return;
        }
        if (!action.config.say) {
          toast.error("Please enter text to say for Call Someone and Say");
          return;
        }
      }
      if (action.type === "integration.set_field") {
        if (!action.config.field_key) {
          toast.error("Please choose a FADV field for 'Set integration field'");
          return;
        }
        if (action.config.value === undefined || action.config.value === null || action.config.value === "") {
          toast.error("Please enter a value for 'Set integration field'");
          return;
        }
      }
      if (action.type === "fadv.add_subject") {
        if (
          !action.config.package_column_id ||
          !action.config.facility_id_column_id ||
          !action.config.position_type_column_id
        ) {
          toast.error("Please select all three input columns (Package, Facility ID, Position Type) for the FADV action");
          return;
        }
        if (!action.config.output_column_id) {
          toast.error("Please select an output column for the FADV action (where status messages will be written)");
          return;
        }
      }
      if (action.type === "fadv.approve_order") {
        if (!action.config.subject_id_column_id) {
          toast.error("Please select the Profile ID column for the FADV Approve action");
          return;
        }
        if (!action.config.output_column_id) {
          toast.error("Please select an output column for the FADV Approve action");
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
          toast.error("Please select all four input columns (Driver FedEx ID, Start Date, Completion Date, Contract Number) for the Impact Solutions Safety Cert action");
          return;
        }
        if (!action.config.output_column_id) {
          toast.error("Please select an output column for the Impact Solutions Safety Cert action (where status messages will be written)");
          return;
        }
      }
      if (action.type === "lms.send_training_link") {
        if (!action.config.course_id) {
          toast.error("Please select a training course for the 'Send Training Link' action");
          return;
        }
      }
      if (action.type === "ai.score_resume") {
        if (!action.config.score_column_id) {
          toast.error("Please select a score output column for the AI scoring action");
          return;
        }
        if (!action.config.feedback_column_id) {
          toast.error("Please select a feedback output column for the AI scoring action");
          return;
        }
        if (!action.config.criteria?.trim()) {
          toast.error("Please enter scoring criteria for the AI scoring action");
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
      toast.error(err.message);
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
    } else if (selectedTrigger.key === "gmail.email_received") {
      const parts: string[] = [];
      if (triggerConfig.sender_contains) parts.push(`from ${triggerConfig.sender_contains}`);
      if (triggerConfig.subject_contains) parts.push(`"${triggerConfig.subject_contains}"`);
      triggerText = parts.length > 0
        ? `email received ${parts.join(" ")}`
        : "email received in Gmail";
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

    return `When ${triggerText}${conditionSuffix} \u2192 ${actionTexts.join(" and ")}`;
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
          bodyExtractAdvanced={bodyExtractAdvanced}
          onBodyExtractAdvancedChange={setBodyExtractAdvanced}
        />

        {/* Connector line */}
        {selectedTrigger && (
          <div className="flex justify-center">
            <div className="w-px h-4 bg-rf-border" />
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
                className="px-5 py-2 text-sm bg-rf-ink-100 text-rf-ink-700 rounded-lg hover:bg-rf-ink-100 transition-colors disabled:opacity-50 font-medium"
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
