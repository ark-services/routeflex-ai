"use client";

import { useState, useEffect, useRef } from "react";
import { Mail, Plus, ChevronDown, AtSign, AlertCircle, Sparkles, X, Loader2 } from "lucide-react";

interface Column {
  id: string;
  name: string;
  type: string;
}

interface GmailConnection {
  id: string;
  email_address: string;
}

interface FilterCondition {
  type: string;
  column_id?: string;
  value: string | number | "";
}

interface SendEmailGmailActionProps {
  companyId: string;
  accountId: string;
  action: { type: string; config: Record<string, any> };
  columns: Column[];
  onChange: (updates: { config: Record<string, any> }) => void;
  triggerKey?: string;
  triggerConfig?: Record<string, any>;
  filterConditions?: FilterCondition[];
}

export function SendEmailGmailAction({
  companyId,
  accountId,
  action,
  columns,
  onChange,
  triggerKey,
  triggerConfig,
  filterConditions,
}: SendEmailGmailActionProps) {
  const integrationsHref = `/admin/${accountId}/companies/${companyId}/integrations`;
  const [connections, setConnections] = useState<GmailConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
  const [showVariableMenu, setShowVariableMenu] = useState<'subject' | 'body' | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const cursorPos = useRef<number>(0);

  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    loadConnections();
  }, [companyId]);

  async function loadConnections() {
    try {
      const response = await fetch(`/api/integrations/gmail/connections?company_id=${companyId}`);
      if (response.ok) {
        const data = await response.json();
        setConnections(data.connections || []);
      }
    } catch (err) {
      console.error('Failed to load connections:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateEmail() {
    setAiLoading(true);
    setAiError('');
    try {
      const response = await fetch('/api/automations/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_key: triggerKey ?? '',
          trigger_config: triggerConfig ?? {},
          filter_conditions: filterConditions ?? [],
          columns,
          user_prompt: aiPrompt,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAiError(data.error ?? 'Failed to generate email.');
        return;
      }
      onChange({ config: { ...action.config, subject: data.subject, body: data.body } });
      setShowAiPanel(false);
      setAiPrompt('');
    } catch {
      setAiError('Failed to generate email. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }

  const selectedConnection = connections.find(c => c.id === action.config.connection_id);
  const emailColumns = columns.filter(c => c.type === 'email');
  const selectedRecipientColumn = emailColumns.find(c => c.id === action.config.recipient_column_id);

  const variables = [
    { key: 'applicant_name', label: 'Applicant Name' },
    { key: 'applicant_email', label: 'Applicant Email' },
    { key: 'job_title', label: 'Job Title' },
    { key: 'company_name', label: 'Company Name' },
    ...columns.map(col => ({
      key: col.name.toLowerCase().replace(/\s+/g, '_'),
      label: col.name,
    })),
  ];

  const insertVariable = (field: 'subject' | 'body', variable: string) => {
    const token = `{{${variable}}}`;
    const currentValue = action.config[field] || '';
    const pos = cursorPos.current;
    const newValue = currentValue.slice(0, pos) + token + currentValue.slice(pos);
    onChange({ config: { ...action.config, [field]: newValue } });
    // Restore focus and move cursor to after the inserted token
    const newPos = pos + token.length;
    setTimeout(() => {
      const el = field === 'subject' ? subjectRef.current : bodyRef.current;
      if (el) {
        el.focus();
        el.selectionStart = newPos;
        el.selectionEnd = newPos;
      }
    }, 0);
    setShowVariableMenu(null);
  };

  if (loading) {
    return <div className="text-sm text-gray-500 py-2">Loading Gmail accounts...</div>;
  }

  return (
    // w-full breaks out of the flex-wrap sentence container in ActionEditor
    <div className="w-full space-y-4 pt-1">

      {/* Row 1: Account + Recipient side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Account picker */}
        <div className="relative">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 block">
            From
          </label>
          <button
            onClick={() => setShowAccountDropdown(!showAccountDropdown)}
            className={`w-full px-3 py-2.5 border rounded-lg text-left flex items-center justify-between transition-colors ${
              selectedConnection
                ? 'border-rf-blue-tint bg-rf-blue-tint'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Mail className={`w-4 h-4 flex-shrink-0 ${selectedConnection ? 'text-rf-blue' : 'text-gray-400'}`} />
              <span className={`text-sm font-medium truncate ${selectedConnection ? 'text-blue-900' : 'text-gray-500'}`}>
                {selectedConnection ? selectedConnection.email_address : 'Select account'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>

          {showAccountDropdown && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {connections.length > 0 ? (
                connections.map((conn) => (
                  <button
                    key={conn.id}
                    onClick={() => {
                      onChange({ config: { ...action.config, connection_id: conn.id } });
                      setShowAccountDropdown(false);
                    }}
                    className="w-full px-3 py-2.5 text-left hover:bg-rf-blue-tint flex items-center gap-2 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <Mail className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="text-sm text-gray-900 truncate">{conn.email_address}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-center">
                  <p className="text-sm text-gray-600 mb-1">No Gmail accounts connected</p>
                  <a href={integrationsHref} className="text-xs text-rf-blue font-medium">Connect Gmail →</a>
                </div>
              )}
            </div>
          )}

          {!selectedConnection && connections.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              <a href={integrationsHref} className="underline">Connect a Gmail account</a> to send emails.
            </p>
          )}
        </div>

        {/* Recipient picker */}
        <div className="relative">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 block">
            To
          </label>
          <button
            onClick={() => setShowRecipientDropdown(!showRecipientDropdown)}
            className={`w-full px-3 py-2.5 border rounded-lg text-left flex items-center justify-between transition-colors ${
              selectedRecipientColumn
                ? 'border-rf-blue bg-rf-blue-tint'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <AtSign className={`w-4 h-4 flex-shrink-0 ${selectedRecipientColumn ? 'text-rf-blue' : 'text-gray-400'}`} />
              <span className={`text-sm font-medium truncate ${selectedRecipientColumn ? 'text-rf-blue' : 'text-gray-500'}`}>
                {selectedRecipientColumn ? selectedRecipientColumn.name : 'Select email column'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>

          {showRecipientDropdown && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {emailColumns.length > 0 ? (
                emailColumns.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => {
                      onChange({ config: { ...action.config, recipient_column_id: col.id } });
                      setShowRecipientDropdown(false);
                    }}
                    className="w-full px-3 py-2.5 text-left hover:bg-rf-blue-tint flex items-center gap-2 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <AtSign className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="text-sm text-gray-900">{col.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-center">
                  <p className="text-xs text-gray-600">No email columns on this board.</p>
                </div>
              )}
            </div>
          )}

          {emailColumns.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">Add an email-type column to select a recipient.</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* Compose section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Compose</span>
        <button
          onClick={() => { setShowAiPanel(!showAiPanel); setAiError(''); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate with AI
        </button>
      </div>

      {/* AI Generation Panel */}
      {showAiPanel && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-purple-800">Generate email with AI</p>
              <p className="text-xs text-purple-600 mt-0.5">
                Claude will use your automation&apos;s trigger and conditions as context.
              </p>
            </div>
            <button
              onClick={() => { setShowAiPanel(false); setAiError(''); }}
              className="text-purple-400 hover:text-purple-600 transition-colors mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-purple-700 mb-1 block">
              Additional instructions (optional)
            </label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g., Keep it short and friendly. Mention that they can reapply in 6 months."
              className="w-full px-3 py-2 border border-purple-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white resize-none"
              rows={2}
            />
          </div>

          {aiError && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {aiError}
            </div>
          )}

          <button
            onClick={handleGenerateEmail}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {aiLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
            ) : (
              <><Sparkles className="w-4 h-4" />Generate email</>
            )}
          </button>
        </div>
      )}

      {/* Subject */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-gray-700">Subject</label>
          <div className="relative">
            <button
              onClick={() => {
                cursorPos.current = subjectRef.current?.selectionStart ?? (action.config.subject?.length || 0);
                setShowVariableMenu(v => v === 'subject' ? null : 'subject');
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-rf-blue bg-rf-blue-tint rounded hover:bg-rf-blue-tint/80 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add variable
            </button>
            {showVariableMenu === 'subject' && (
              <VariableDropdown
                label="subject"
                variables={variables}
                onInsert={(v) => insertVariable('subject', v)}
                onClose={() => setShowVariableMenu(null)}
              />
            )}
          </div>
        </div>
        <input
          ref={subjectRef}
          type="text"
          value={action.config.subject || ''}
          onChange={(e) => onChange({ config: { ...action.config, subject: e.target.value } })}
          onSelect={() => { cursorPos.current = subjectRef.current?.selectionStart ?? 0; }}
          placeholder="e.g., An update on your application for {{job_title}}"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[16px] md:text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue bg-white"
        />
      </div>

      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-gray-700">Message</label>
          <div className="relative">
            <button
              onClick={() => {
                cursorPos.current = bodyRef.current?.selectionStart ?? (action.config.body?.length || 0);
                setShowVariableMenu(v => v === 'body' ? null : 'body');
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-rf-blue bg-rf-blue-tint rounded hover:bg-rf-blue-tint/80 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add variable
            </button>
            {showVariableMenu === 'body' && (
              <VariableDropdown
                label="message"
                variables={variables}
                onInsert={(v) => insertVariable('body', v)}
                onClose={() => setShowVariableMenu(null)}
              />
            )}
          </div>
        </div>
        <textarea
          ref={bodyRef}
          value={action.config.body || ''}
          onChange={(e) => onChange({ config: { ...action.config, body: e.target.value } })}
          onSelect={() => { cursorPos.current = bodyRef.current?.selectionStart ?? 0; }}
          placeholder={"Hi {{applicant_name}},\n\nThank you for applying to {{job_title}}..."}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue resize-y font-mono leading-relaxed bg-white"
          rows={12}
        />
        <p className="text-xs text-gray-400 mt-1">HTML is supported</p>
      </div>
    </div>
  );
}

function VariableDropdown({
  label,
  variables,
  onInsert,
  onClose,
}: {
  label: string;
  variables: { key: string; label: string }[];
  onInsert: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop to close on outside click */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute z-30 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-64 overflow-y-auto">
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg sticky top-0">
          <p className="text-xs font-medium text-gray-600">Insert into {label}</p>
        </div>
        {variables.map((v) => (
          <button
            key={v.key}
            onClick={() => onInsert(v.key)}
            className="w-full px-3 py-2 text-left hover:bg-rf-blue-tint transition-colors border-b border-gray-50 last:border-0"
          >
            <span className="text-sm text-gray-900">{v.label}</span>
            <span className="block text-xs text-gray-400 font-mono mt-0.5">{`{{${v.key}}}`}</span>
          </button>
        ))}
      </div>
    </>
  );
}
