"use client";

import { useState, useEffect } from "react";
import { Mail, Plus, ChevronDown, User, AtSign, AlertCircle } from "lucide-react";

interface Column {
  id: string;
  name: string;
  type: string;
}

interface GmailConnection {
  id: string;
  email_address: string;
}

interface SendEmailGmailActionProps {
  companyId: string;
  accountId: string;
  action: { type: string; config: Record<string, any> };
  columns: Column[];
  onChange: (updates: { config: Record<string, any> }) => void;
}

export function SendEmailGmailAction({
  companyId,
  accountId,
  action,
  columns,
  onChange,
}: SendEmailGmailActionProps) {
  const integrationsHref = `/admin/${accountId}/companies/${companyId}/integrations`;
  const [connections, setConnections] = useState<GmailConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
  const [showVariableMenu, setShowVariableMenu] = useState(false);
  const [variableTarget, setVariableTarget] = useState<'subject' | 'body'>('subject');

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
                ? 'border-blue-300 bg-blue-50 hover:bg-blue-100'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                selectedConnection ? 'bg-blue-100' : 'bg-gray-100'
              }`}>
                <Mail className={`w-4 h-4 ${selectedConnection ? 'text-blue-600' : 'text-gray-400'}`} />
              </div>
              <span className={`text-sm font-medium ${selectedConnection ? 'text-blue-900' : 'text-gray-500'}`}>
                {selectedConnection ? selectedConnection.email_address : 'Select Gmail account'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {showAccountDropdown && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {connections.length > 0 ? (
                connections.map((conn) => (
                  <button
                    key={conn.id}
                    onClick={() => {
                      onChange({ config: { ...action.config, connection_id: conn.id } });
                      setShowAccountDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 transition-colors border-b border-gray-100 last:border-0"
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
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Connect Gmail →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {!selectedConnection && connections.length === 0 && (
          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
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
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">
          Email
        </label>

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
                className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[16px] md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add variable
              </button>
            </div>
            <textarea
              value={action.config.body || ''}
              onChange={(e) => onChange({ config: { ...action.config, body: e.target.value } })}
              placeholder="Hi {{applicant_name}},&#10;&#10;Thank you for applying to {{job_title}}..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              rows={6}
            />
            <p className="text-xs text-gray-500 mt-1">HTML is supported</p>
          </div>

          {/* Variable Menu */}
          {showVariableMenu && (
            <div className="relative">
              <div className="absolute z-30 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-60 overflow-y-auto">
                <div className="p-2 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-700">Insert variable</p>
                </div>
                {variables.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => insertVariable(v.key)}
                    className="w-full px-3 py-2 text-left hover:bg-blue-50 text-sm"
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
                ? 'border-purple-300 bg-purple-50 hover:bg-purple-100'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                selectedRecipientColumn ? 'bg-purple-100' : 'bg-gray-100'
              }`}>
                <AtSign className={`w-4 h-4 ${selectedRecipientColumn ? 'text-purple-600' : 'text-gray-400'}`} />
              </div>
              <span className={`text-sm font-medium ${selectedRecipientColumn ? 'text-purple-900' : 'text-gray-500'}`}>
                {selectedRecipientColumn ? `Send to: ${selectedRecipientColumn.name}` : 'Select recipient column'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {showRecipientDropdown && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {emailColumns.length > 0 ? (
                emailColumns.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => {
                      onChange({ config: { ...action.config, recipient_column_id: col.id } });
                      setShowRecipientDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-purple-50 flex items-center gap-3 transition-colors border-b border-gray-100 last:border-0"
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
          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Add an email-type column to your board to select recipients
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
