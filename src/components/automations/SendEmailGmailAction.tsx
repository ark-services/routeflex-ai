"use client";

import { useState, useEffect } from "react";
import { Mail, Plus, ChevronDown, User, AtSign, AlertCircle, Sparkles, X, Loader2 } from "lucide-react";

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
  // Automation context for AI generation
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
  const [showVariableMenu, setShowVariableMenu] = useState(false);
  const [variableTarget, setVariableTarget] = useState<'subject' | 'body'>('subject');

  // AI generation state
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
    } catch (err) {
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

  const insertVariable = (variable: string) => {
    const field = variableTarget;
    const currentValue = action.config[field] || '';
    const newValue = currentValue + `{{${variable}}}`;
    onChange({ config: { ...action.config, [field]: newValue } });
    setShowVariableMenu(false);
  };

  if (loading) {
    return <div className="text-sm text-gray-500 py-4">Loading Gmail accounts...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Step 1: Choose Account */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">
          Choose account
        </label>

        <div className="relative">
          <button
            onClick={() => setShowAccountDropdown(!showAccountDropdown)}
            className={`w-full px-4 py-3 border rounded-lg text-left flex items-center justify-between transition-colors ${
              selectedConnection
                ? 'border-rf-blue-tint bg-rf-blue-tint hover:bg-rf-blue-tint'
                : 'border-gray-300 bg-rf-surface-card hover:border-gray-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                selectedConnection ? 'bg-rf-blue-tint' : 'bg-gray-100'
              }`}>
                <Mail className={`w-4 h-4 ${selectedConnection ? 'text-rf-blue' : 'text-gray-400'}`} />
              </div>
              <span className={`text-sm font-medium ${selectedConnection ? 'text-blue-900' : 'text-gray-500'}`}>
                {selectedConnection ? selectedConnection.email_address : 'Select Gmail account'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {showAccountDropdown && (
            <div className="absolute z-30 w-full mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {connections.length > 0 ? (
                connections.map((conn) => (
                  <button
                    key={conn.id}
                    onClick={() => {
                      onChange({ config: { ...action.config, connection_id: conn.id } });
                      setShowAccountDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-rf-blue-tint flex items-center gap-3 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <Mail className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-900">{conn.email_address}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-center">
                  <p className="text-sm text-gray-600 mb-2">No Gmail accounts connected</p>
                  <a
                    href={integrationsHref}
                    className="text-xs text-rf-blue hover:text-rf-blue font-medium"
                  >
                    Connect Gmail →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {!selectedConnection && connections.length === 0 && (
          <div className="mt-2 px-3 py-2 bg-rf-warning-bg border border-amber-200 rounded flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rf-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rf-warning">
              No Gmail accounts connected.{' '}
              <a href={integrationsHref} className="underline font-medium">
                Connect one now
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Step 2: Compose Email */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Email
          </label>
          <button
            onClick={() => {
              setShowAiPanel(!showAiPanel);
              setAiError('');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Generate with AI
          </button>
        </div>

        {/* AI Generation Panel */}
        {showAiPanel && (
          <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-purple-800">Generate email with AI</p>
                <p className="text-xs text-purple-600 mt-0.5">
                  AI will use your automation&apos;s trigger and conditions as context.
                </p>
              </div>
              <button
                onClick={() => { setShowAiPanel(false); setAiError(''); }}
                className="text-purple-400 hover:text-purple-600 transition-colors"
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
                rows={3}
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
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate email
                </>
              )}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {/* Subject */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Subject</label>
              <button
                onClick={() => {
                  setVariableTarget('subject');
                  setShowVariableMenu(!showVariableMenu);
                }}
                className="px-2 py-1 text-xs bg-rf-blue-tint text-rf-blue rounded hover:bg-rf-blue-tint transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add variable
              </button>
            </div>
            <input
              type="text"
              value={action.config.subject || ''}
              onChange={(e) => onChange({ config: { ...action.config, subject: e.target.value } })}
              placeholder="e.g., Welcome to {{company_name}}, {{applicant_name}}!"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[16px] md:text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Message</label>
              <button
                onClick={() => {
                  setVariableTarget('body');
                  setShowVariableMenu(!showVariableMenu);
                }}
                className="px-2 py-1 text-xs bg-rf-blue-tint text-rf-blue rounded hover:bg-rf-blue-tint transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add variable
              </button>
            </div>
            <textarea
              value={action.config.body || ''}
              onChange={(e) => onChange({ config: { ...action.config, body: e.target.value } })}
              placeholder="Hi {{applicant_name}},&#10;&#10;Thank you for applying to {{job_title}}..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue resize-y"
              rows={6}
            />
            <p className="text-xs text-gray-500 mt-1">HTML is supported</p>
          </div>

          {/* Variable Menu */}
          {showVariableMenu && (
            <div className="relative">
              <div className="absolute z-30 right-0 mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg w-64 max-h-60 overflow-y-auto">
                <div className="p-2 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-700">Insert variable</p>
                </div>
                {variables.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => insertVariable(v.key)}
                    className="w-full px-3 py-2 text-left hover:bg-rf-blue-tint text-sm"
                  >
                    <span className="text-gray-900">{v.label}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{`{{${v.key}}}`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 3: Select Recipient */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">
          Someone
        </label>

        <div className="relative">
          <button
            onClick={() => setShowRecipientDropdown(!showRecipientDropdown)}
            className={`w-full px-4 py-3 border rounded-lg text-left flex items-center justify-between transition-colors ${
              selectedRecipientColumn
                ? 'border-rf-blue bg-rf-blue-tint hover:bg-rf-blue-tint'
                : 'border-gray-300 bg-rf-surface-card hover:border-gray-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                selectedRecipientColumn ? 'bg-rf-blue-tint' : 'bg-rf-ink-100'
              }`}>
                <AtSign className={`w-4 h-4 ${selectedRecipientColumn ? 'text-rf-blue' : 'text-gray-400'}`} />
              </div>
              <span className={`text-sm font-medium ${selectedRecipientColumn ? 'text-rf-blue' : 'text-rf-text-secondary'}`}>
                {selectedRecipientColumn ? `Send to: ${selectedRecipientColumn.name}` : 'Select recipient column'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {showRecipientDropdown && (
            <div className="absolute z-30 w-full mt-1 bg-rf-surface-card border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {emailColumns.length > 0 ? (
                emailColumns.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => {
                      onChange({ config: { ...action.config, recipient_column_id: col.id } });
                      setShowRecipientDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-rf-surface-page flex items-center gap-3 transition-colors border-b border-rf-ink-100 last:border-0"
                  >
                    <AtSign className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-900">{col.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-center">
                  <p className="text-xs text-gray-600">
                    No email columns found. Add an email-type column to your board first.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {emailColumns.length === 0 && (
          <div className="mt-2 px-3 py-2 bg-rf-warning-bg border border-amber-200 rounded flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rf-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rf-warning">
              Add an email-type column to your board to select recipients
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
