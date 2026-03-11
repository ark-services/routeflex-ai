"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import type { Action, Column, Group, FilterCondition, VariableGroup } from "./automations-types";
import { TEXT_COL_TYPES, slugifyColName } from "./automations-types";
import { ColumnPicker, LabelPicker, CoursePicker, StatusLabelPicker, GroupPicker, VariablePickerButton } from "./Pickers";
import { ActionTypeLabel } from "./ActionTypeLabel";
import { EmailGmailEditor } from "./EmailGmailEditor";
import { SendEmailGmailAction } from "./SendEmailGmailAction";
import { TwilioSmsAction } from "./TwilioSmsAction";
import { TwilioCallAction } from "./TwilioCallAction";
import { EsignAgreementAction } from "./EsignAgreementAction";

export function ActionEditor({
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
    { value: "esign.send_agreement", label: "Send eSign Agreement (Adobe Sign)" },
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
    <div className="border border-emerald-200/80 bg-emerald-50/40 rounded-rf-lg px-4 py-3.5 shadow-rf-sm">
      <div className="flex items-center justify-between mb-1.5">
        <ActionTypeLabel
          type={action.type}
          actionTypes={actionTypes}
          onChange={(type) => onChange({ type, config: {} })}
        />
        <button
          onClick={onRemove}
          className="p-1 hover:bg-emerald-100 rounded-rf-sm flex-shrink-0 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-rf-text-muted hover:text-rf-danger" />
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
              className="w-full px-3 py-2 border border-rf-border rounded bg-rf-surface-card"
            />
            <textarea
              value={action.config.message || ""}
              onChange={(e) => onChange({ config: { ...action.config, message: e.target.value } })}
              placeholder="Message (use {{applicant_id}} for variables)"
              className="w-full px-3 py-2 border border-rf-border rounded bg-rf-surface-card"
              rows={2}
            />
          </div>
        )}

        {action.type === "send_email" && (
          <span className="text-rf-text-muted text-sm">(Email integration stub - configure in code)</span>
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
              <option value="">choose field\u2026</option>
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
              placeholder="value\u2026"
              className="px-2 py-0.5 text-sm border border-rf-blue-tint rounded bg-rf-surface-card text-rf-blue font-medium min-w-[120px]"
            />
          </>
        )}

        {action.type === "fadv.add_subject" && (
          <div className="w-full space-y-3 pt-1">
            {/* Package column */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-28 shrink-0">Package from</span>
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
              <span className="text-sm text-rf-ink-700 w-28 shrink-0">Facility ID from</span>
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
              <span className="text-sm text-rf-ink-700 w-28 shrink-0">Position Type from</span>
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

            {/* First Name column (optional) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-28 shrink-0">First Name from</span>
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

            {/* Last Name column (optional) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-28 shrink-0">Last Name from</span>
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

            {/* Email column (optional) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-28 shrink-0">Email from</span>
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
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rf-border">
              <span className="text-sm text-rf-text-muted w-28 shrink-0">Write result to</span>
              <ColumnPicker
                columns={columns.filter((c) => TEXT_COL_TYPES.includes(c.type))}
                selectedId={action.config.output_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, output_column_id: id } })
                }
                placeholder="output column"
              />
            </div>

            {/* Subject ID column (optional) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-text-muted w-28 shrink-0">Applicant ID to</span>
              <ColumnPicker
                columns={columns.filter((c) => TEXT_COL_TYPES.includes(c.type))}
                selectedId={action.config.subject_id_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, subject_id_column_id: id } })
                }
                placeholder="column (optional)"
              />
            </div>
          </div>
        )}

        {action.type === "fadv.approve_order" && (() => {
          const statusCol = columns.find((c) => c.id === action.config.status_column_id);
          const statusLabels = statusCol?.labels ?? [];
          return (
            <div className="w-full space-y-3 pt-1">
              {/* Profile ID column */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-rf-ink-700 w-28 shrink-0">Profile ID from</span>
                <ColumnPicker
                  columns={columns.filter(
                    (c) => TEXT_COL_TYPES.includes(c.type) || c.type.startsWith("fadv.")
                  )}
                  selectedId={action.config.subject_id_column_id}
                  onSelect={(id) =>
                    onChange({ config: { ...action.config, subject_id_column_id: id } })
                  }
                  placeholder="column"
                />
              </div>

              {/* Output column */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rf-border">
                <span className="text-sm text-rf-text-muted w-28 shrink-0">Write result to</span>
                <ColumnPicker
                  columns={columns.filter((c) => TEXT_COL_TYPES.includes(c.type))}
                  selectedId={action.config.output_column_id}
                  onSelect={(id) =>
                    onChange({ config: { ...action.config, output_column_id: id } })
                  }
                  placeholder="output column"
                />
              </div>

              {/* Status column + label pickers (optional) */}
              <div className="space-y-2 pt-1 border-t border-rf-border">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-rf-text-muted w-28 shrink-0">Write status to</span>
                  <ColumnPicker
                    columns={columns.filter((c) => c.type === "status")}
                    selectedId={action.config.status_column_id}
                    onSelect={(id) =>
                      onChange({ config: {
                        ...action.config, status_column_id: id,
                        queued_label_id: undefined,
                        approved_label_id: undefined,
                        error_label_id: undefined,
                      }})
                    }
                    placeholder="status column (optional)"
                  />
                </div>
                {statusLabels.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-rf-text-muted w-28 shrink-0">{"\u21b3"} Queued label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.queued_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, queued_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-rf-text-muted w-28 shrink-0">{"\u21b3"} Approved label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.approved_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, approved_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-rf-text-muted w-28 shrink-0">{"\u21b3"} Error label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.error_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, error_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

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
                { label: "Application Progress Page", token: "{{portal_link}}" },
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
                <span className="text-sm text-rf-ink-700 w-36 shrink-0">Send course</span>
                <CoursePicker
                  courses={lmsCourses}
                  selectedId={action.config.course_id}
                  onSelect={(id) => onChange({ config: { ...action.config, course_id: id } })}
                />
              </div>

              {/* Email column */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-rf-ink-700 w-36 shrink-0">Get email from</span>
                <ColumnPicker
                  columns={columns.filter((c) => c.type === "email" || c.type === "text")}
                  selectedId={action.config.email_column_id}
                  onSelect={(id) => onChange({ config: { ...action.config, email_column_id: id } })}
                  placeholder="auto-detect"
                />
              </div>

              {/* Status column + label pickers */}
              <div className="space-y-2 pt-1 border-t border-rf-border">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-rf-ink-700 w-36 shrink-0">Write status to</span>
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
                      <span className="text-xs text-rf-text-muted w-36 shrink-0">{"\u21b3"} Link sent label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.link_sent_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, link_sent_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-rf-text-muted w-36 shrink-0">{"\u21b3"} In progress label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.in_progress_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, in_progress_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-rf-text-muted w-36 shrink-0">{"\u21b3"} Passed label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.passed_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, passed_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-1">
                      <span className="text-xs text-rf-text-muted w-36 shrink-0">{"\u21b3"} Failed label</span>
                      <LabelPicker labels={statusLabels} selectedId={action.config.failed_label_id}
                        onSelect={(id) => onChange({ config: { ...action.config, failed_label_id: id } })}
                        placeholder="choose label" />
                    </div>
                  </>
                )}
              </div>

              {/* Email customization */}
              <div className="space-y-2 pt-1 border-t border-rf-border">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="text-sm text-rf-ink-700 w-36 shrink-0 pt-1.5">Email subject</span>
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
                      className="w-full text-sm border border-rf-border rounded-lg px-3 py-1.5 bg-rf-surface-card focus:outline-none focus:ring-2 focus:ring-rf-blue"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <span className="text-sm text-rf-ink-700 w-36 shrink-0 pt-1.5">Email message</span>
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
                      className="w-full text-sm border border-rf-border rounded-lg px-3 py-1.5 bg-rf-surface-card focus:outline-none focus:ring-2 focus:ring-rf-blue resize-y"
                    />
                  </div>
                </div>
              </div>

              {/* Output column */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rf-border">
                <span className="text-sm text-rf-text-muted w-36 shrink-0">Write progress to</span>
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
                { label: "Application Progress Page", token: "{{portal_link}}" },
              ],
            },
            ...(columns.length > 0
              ? [{ section: "Board columns", items: columns.map((c) => ({ label: c.name, token: `{{col:${slugifyColName(c.name)}}}` })) }]
              : []),
          ];
          return (
          <div className="w-full space-y-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-36 shrink-0">Get email from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "email" || c.type === "text")}
                selectedId={action.config.email_column_id}
                onSelect={(id) => onChange({ config: { ...action.config, email_column_id: id } })}
                placeholder="auto-detect"
              />
            </div>

            {/* Email customization */}
            <div className="space-y-2 pt-1 border-t border-rf-border">
              <div className="flex flex-wrap items-start gap-2">
                <span className="text-sm text-rf-ink-700 w-36 shrink-0 pt-1.5">Email subject</span>
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
                    className="w-full text-sm border border-rf-border rounded-lg px-3 py-1.5 bg-rf-surface-card focus:outline-none focus:ring-2 focus:ring-rf-blue"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <span className="text-sm text-rf-ink-700 w-36 shrink-0 pt-1.5">Email message</span>
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
                    className="w-full text-sm border border-rf-border rounded-lg px-3 py-1.5 bg-rf-surface-card focus:outline-none focus:ring-2 focus:ring-rf-blue resize-y"
                  />
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {action.type === "safety_trainer.submit" && (
          <div className="w-full space-y-3 pt-1">
            {/* Driver FedEx ID column */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-36 shrink-0">Driver FedEx ID from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "text" || c.type === "number")}
                selectedId={action.config.driver_fedex_id_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, driver_fedex_id_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Stage 1 Start Date column */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-36 shrink-0">Stage 1 Start Date from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "date")}
                selectedId={action.config.start_date_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, start_date_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Stage 1 Completion Date column */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-36 shrink-0">Completion Date from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "date")}
                selectedId={action.config.completion_date_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, completion_date_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Contract Number column */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-36 shrink-0">Contract Number from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "text" || c.type === "number")}
                selectedId={action.config.contract_number_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, contract_number_column_id: id } })
                }
                placeholder="column"
              />
            </div>

            {/* Output column */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rf-border">
              <span className="text-sm text-rf-text-muted w-36 shrink-0">Write result to</span>
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

        {action.type === "esign.send_agreement" && (
          <EsignAgreementAction
            companyId={companyId}
            action={action}
            columns={columns}
            onChange={onChange}
          />
        )}

        {action.type === "ai.score_resume" && (
          <div className="w-full space-y-3 pt-1">
            {/* Resume file column (optional) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-32 shrink-0">Resume from</span>
              <ColumnPicker
                columns={columns.filter((c) => c.type === "file")}
                selectedId={action.config.file_column_id}
                onSelect={(id) =>
                  onChange({ config: { ...action.config, file_column_id: id } })
                }
                placeholder="file column (optional)"
              />
            </div>
            <p className="text-xs text-rf-text-muted ml-32">
              Optional. Falls back to the applicant&apos;s uploaded resume if left empty.
            </p>

            {/* Score output column (required) */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-rf-ink-700 w-32 shrink-0">Write score to</span>
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
              <span className="text-sm text-rf-ink-700 w-32 shrink-0">Write feedback to</span>
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
            <div className="flex flex-col gap-1.5 pt-2 border-t border-rf-border">
              <span className="text-sm text-rf-ink-700">Scoring criteria</span>
              <textarea
                value={action.config.criteria || ""}
                onChange={(e) =>
                  onChange({ config: { ...action.config, criteria: e.target.value } })
                }
                placeholder={"Describe what to evaluate, e.g.:\n- CDL Class A license required\n- 2+ years delivery experience preferred\n- Clean driving record\n- Score 1-10, where 8+ is a strong candidate"}
                className="w-full px-3 py-2 border border-rf-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-rf-blue min-h-[100px] resize-y bg-rf-surface-card"
                rows={5}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
