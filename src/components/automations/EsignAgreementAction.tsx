"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Action, Column } from "./automations-types";
import { TEXT_COL_TYPES } from "./automations-types";
import { ColumnPicker, LabelPicker } from "./Pickers";
import { getEsignTemplates, type EsignTemplateData } from "@/components/integrations/adobe-sign-actions";

export function EsignAgreementAction({
  companyId,
  action,
  columns,
  onChange,
}: {
  companyId: string;
  action: Action;
  columns: Column[];
  onChange: (updates: Partial<Action>) => void;
}) {
  const [templates, setTemplates] = useState<EsignTemplateData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEsignTemplates(companyId)
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [companyId]);

  const statusCol = columns.find(
    (c) => c.id === action.config.status_column_id
  );
  const statusLabels = statusCol?.labels ?? [];

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-rf-text-muted py-1">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading templates...
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 pt-1">
      {/* Template selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-rf-ink-700 w-36 shrink-0">
          Send template
        </span>
        <select
          value={action.config.template_id || ""}
          onChange={(e) =>
            onChange({ config: { ...action.config, template_id: e.target.value } })
          }
          className="flex-1 px-2 py-1.5 text-sm border border-rf-blue-tint rounded bg-rf-surface-card text-rf-blue font-medium"
        >
          <option value="">Choose template...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
      </div>

      {templates.length === 0 && (
        <p className="text-xs text-rf-text-muted pl-36">
          No eSign templates configured. Set them up in Integrations &gt; Adobe
          Sign.
        </p>
      )}

      {/* Output section */}
      <div className="space-y-2 pt-1 border-t border-rf-border">
        {/* Write result to */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-rf-text-muted w-36 shrink-0">
            Write result to
          </span>
          <ColumnPicker
            columns={columns.filter((c) => TEXT_COL_TYPES.includes(c.type))}
            selectedId={action.config.output_column_id}
            onSelect={(id) =>
              onChange({ config: { ...action.config, output_column_id: id } })
            }
            placeholder="text column"
          />
        </div>

        {/* Write status to */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-rf-text-muted w-36 shrink-0">
            Write status to
          </span>
          <ColumnPicker
            columns={columns.filter((c) => c.type === "status")}
            selectedId={action.config.status_column_id}
            onSelect={(id) =>
              onChange({
                config: {
                  ...action.config,
                  status_column_id: id,
                  completed_label_id: undefined,
                },
              })
            }
            placeholder="status column (optional)"
          />
        </div>

        {/* Completed label */}
        {statusLabels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pl-1">
            <span className="text-xs text-rf-text-muted w-36 shrink-0">
              {"\u21b3"} Completed label
            </span>
            <LabelPicker
              labels={statusLabels}
              selectedId={action.config.completed_label_id}
              onSelect={(id) =>
                onChange({
                  config: { ...action.config, completed_label_id: id },
                })
              }
              placeholder="choose label"
            />
          </div>
        )}

        {/* Save signed PDF to */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-rf-text-muted w-36 shrink-0">
            Save signed PDF to
          </span>
          <ColumnPicker
            columns={columns.filter((c) => c.type === "file")}
            selectedId={action.config.file_column_id}
            onSelect={(id) =>
              onChange({ config: { ...action.config, file_column_id: id } })
            }
            placeholder="file column (optional)"
          />
        </div>
      </div>
    </div>
  );
}
