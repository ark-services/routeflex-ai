"use client";
import { useState, useEffect } from "react";
import { PhoneCall, Plus, ChevronDown } from "lucide-react";
import { getTwilioConnection } from "@/components/integrations/twilio-actions";

interface TwilioCallActionProps {
  companyId: string;
  action: { type: string; config: Record<string, any> };
  columns: Array<{ id: string; name: string; type: string }>;
  onChange: (updates: { config: Record<string, any> }) => void;
}

export function TwilioCallAction({ companyId, action, columns, onChange }: TwilioCallActionProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [fromNumber, setFromNumber] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTwilioConnection(companyId).then((conn) => {
      if (conn && conn.isEnabled) {
        setConnected(true);
        setFromNumber(conn.fromNumber);
      } else {
        setConnected(false);
      }
      setLoading(false);
    });
  }, [companyId]);

  const phoneColumns = columns.filter((c) => c.type === "phone");
  const toSource = action.config.toSource ?? { type: "column" };
  const onlyIfPresent = action.config.onlyIfPresent !== false;

  const setToSource = (patch: Record<string, any>) => {
    onChange({ config: { ...action.config, toSource: { ...toSource, ...patch } } });
  };

  const insertVariable = (variable: string) => {
    const current = action.config.say || "";
    onChange({ config: { ...action.config, say: current + `{{${variable}}}` } });
  };

  if (loading) return <div className="text-sm text-rf-text-muted">Loading Twilio...</div>;

  if (!connected) {
    return (
      <div className="px-4 py-3 bg-rf-warning-bg border border-amber-200 rounded-lg">
        <p className="text-sm text-rf-warning">
          No active Twilio integration found for this company. Connect one in Admin → Integrations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      {/* From number display */}
      <div className="flex items-center gap-2 text-sm text-rf-text-secondary">
        <PhoneCall className="w-4 h-4" />
        <span>Calling from: <strong>{fromNumber}</strong></span>
      </div>

      {/* To source selector */}
      <div>
        <label className="text-sm font-medium text-rf-ink-700 block mb-2">Call</label>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={toSource.type ?? "column"}
            onChange={(e) => setToSource({ type: e.target.value, columnId: undefined, value: "" })}
            className="px-3 py-2 border border-rf-border rounded-lg text-sm bg-rf-surface-card"
          >
            <option value="column">Phone column</option>
            <option value="manual">Manual number</option>
          </select>

          {toSource.type === "column" ? (
            <ColumnPicker
              columns={phoneColumns}
              selectedId={toSource.columnId}
              onSelect={(id) => setToSource({ columnId: id })}
              placeholder="Select phone column"
            />
          ) : (
            <input
              type="tel"
              value={toSource.value ?? ""}
              onChange={(e) => setToSource({ value: e.target.value })}
              placeholder="+15551234567"
              className="flex-1 px-3 py-2 border border-rf-border rounded-lg text-sm bg-rf-surface-card"
            />
          )}
        </div>
        {toSource.type === "column" && phoneColumns.length === 0 && (
          <p className="text-xs text-rf-warning mt-1">
            No phone columns on this board. Add a Phone column first.
          </p>
        )}
      </div>

      {/* Say text */}
      <div>
        <label className="text-sm font-medium text-rf-ink-700 block mb-2">Say</label>
        <textarea
          value={action.config.say || ""}
          onChange={(e) => onChange({ config: { ...action.config, say: e.target.value } })}
          placeholder="Text to read aloud… use {{applicant_name}} for variables"
          className="w-full px-3 py-2 border border-rf-border rounded-lg resize-y text-sm bg-rf-surface-card"
          rows={3}
        />
        <div className="flex justify-between items-center mt-2">
          <label className="flex items-center gap-2 text-sm text-rf-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={onlyIfPresent}
              onChange={(e) =>
                onChange({ config: { ...action.config, onlyIfPresent: e.target.checked } })
              }
              className="rounded"
            />
            Skip if no phone number found
          </label>
          <VariableMenu onInsert={insertVariable} />
        </div>
      </div>
    </div>
  );
}

function ColumnPicker({
  columns,
  selectedId,
  onSelect,
  placeholder,
}: {
  columns: Array<{ id: string; name: string }>;
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = columns.find((c) => c.id === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 border border-rf-border rounded-lg text-left flex items-center gap-2 hover:border-rf-ink-300 bg-rf-surface-card text-sm min-w-[180px]"
      >
        <span className={selected ? "text-rf-ink-900" : "text-rf-text-muted flex-1"}>
          {selected?.name || placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-rf-text-muted flex-shrink-0" />
      </button>
      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-rf-surface-card border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {columns.map((col) => (
            <button
              key={col.id}
              onClick={() => { onSelect(col.id); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left hover:bg-rf-blue-tint text-sm"
            >
              {col.name}
            </button>
          ))}
          {columns.length === 0 && (
            <div className="px-3 py-2 text-rf-text-muted text-sm">No phone columns</div>
          )}
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
    { key: "group_name", label: "Group Name" },
    { key: "item_id", label: "Item ID" },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 border border-rf-blue-tint rounded-lg bg-rf-blue-tint text-rf-blue hover:bg-rf-blue-tint text-sm font-medium flex items-center gap-1"
      >
        <Plus className="w-3 h-3" />
        Variable
      </button>
      {isOpen && (
        <div className="absolute z-30 right-0 mt-1 bg-rf-surface-card border rounded-lg shadow-lg min-w-[180px]">
          {variables.map((v) => (
            <button
              key={v.key}
              onClick={() => { onInsert(v.key); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-rf-blue-tint"
            >
              {v.label}
              <span className="block text-xs text-rf-text-muted mt-0.5">{`{{${v.key}}}`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
