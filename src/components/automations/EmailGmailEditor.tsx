"use client";
import { useState, useEffect } from "react";
import { Mail, Plus, ChevronDown } from "lucide-react";
import { getGmailConnection } from "@/components/integrations/actions";

interface EmailGmailEditorProps {
  accountId: string;
  action: { type: string; config: Record<string, any> };
  columns: Array<{ id: string; name: string; type: string }>;
  onChange: (updates: { config: Record<string, any> }) => void;
}

export function EmailGmailEditor({ accountId, action, columns, onChange }: EmailGmailEditorProps) {
  const [gmailConnection, setGmailConnection] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGmailConnection(accountId).then((conn) => {
      setGmailConnection(conn);
      if (conn && !action.config.gmail_connection_id) {
        onChange({ config: { ...action.config, gmail_connection_id: conn.id } });
      }
      setLoading(false);
    });
  }, [accountId]);

  const emailColumns = columns.filter((c) => c.type === "email");

  const insertVariable = (field: 'subject' | 'body', variable: string) => {
    const currentValue = action.config[field] || '';
    onChange({ config: { ...action.config, [field]: currentValue + `{{${variable}}}` } });
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  if (!gmailConnection) {
    return (
      <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800">
          No Gmail account connected.{" "}
          <a href={`/admin/${accountId}/integrations`} className="underline font-medium">
            Connect one in Integrations
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connected Account Display */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Mail className="w-4 h-4" />
        <span>Sending from: <strong>{gmailConnection.email}</strong></span>
      </div>

      {/* Recipient Picker */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">Send to</label>
        <ColumnPicker
          columns={emailColumns}
          selectedId={action.config.recipient_column_id}
          onSelect={(id: string) => onChange({ config: { ...action.config, recipient_column_id: id } })}
          placeholder="Select email column"
        />
        {emailColumns.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            No email columns found. Add an email column to your board first.
          </p>
        )}
      </div>

      {/* Subject */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">Subject</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={action.config.subject || ""}
            onChange={(e) => onChange({ config: { ...action.config, subject: e.target.value } })}
            placeholder="Email subject"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
          />
          <VariableMenu onInsert={(v) => insertVariable('subject', v)} />
        </div>
      </div>

      {/* Body */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">Message</label>
        <textarea
          value={action.config.body || ""}
          onChange={(e) => onChange({ config: { ...action.config, body: e.target.value } })}
          placeholder="Email body (HTML supported)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-y"
          rows={6}
        />
        <div className="flex justify-end mt-2">
          <VariableMenu onInsert={(v) => insertVariable('body', v)} />
        </div>
      </div>
    </div>
  );
}

function ColumnPicker({ columns, selectedId, onSelect, placeholder }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = columns.find((c: any) => c.id === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-left flex items-center justify-between hover:border-blue-400 bg-white"
      >
        <span className={selected ? "text-gray-900" : "text-gray-500"}>
          {selected?.name || placeholder}
        </span>
        <ChevronDown className="w-4 h-4" />
      </button>
      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {columns.map((col: any) => (
            <button
              key={col.id}
              onClick={() => { onSelect(col.id); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left hover:bg-blue-50"
            >
              {col.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VariableMenu({ onInsert }: { onInsert: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const variables = [
    { key: "applicant_name", label: "Applicant Name" },
    { key: "applicant_email", label: "Applicant Email" },
    { key: "job_title", label: "Job Title" },
    { key: "company_name", label: "Company Name" },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium flex items-center gap-1"
      >
        <Plus className="w-3 h-3" />
        Variable
      </button>
      {isOpen && (
        <div className="absolute z-30 right-0 mt-1 bg-white border rounded-lg shadow-lg min-w-[180px]">
          {variables.map((v) => (
            <button
              key={v.key}
              onClick={() => { onInsert(v.key); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
            >
              {v.label}
              <span className="block text-xs text-gray-500 mt-0.5">
                {`{{${v.key}}}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
