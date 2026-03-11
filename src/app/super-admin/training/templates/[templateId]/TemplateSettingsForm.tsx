"use client";

import { useState } from "react";
import { updateCourseTemplate, deleteCourseTemplate } from "../actions";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

const CARRIER_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "fedex_pd", label: "FedEx P&D" },
  { value: "fedex_linehaul", label: "FedEx Linehaul" },
  { value: "amazon_dsp", label: "Amazon DSP" },
  { value: "custom", label: "Custom" },
];

interface Props {
  template: {
    id: string;
    name: string;
    description: string | null;
    carrier_type: string | null;
    is_published: boolean;
  };
}

export function TemplateSettingsForm({ template }: Props) {
  const router = useRouter();
  const confirm = useConfirmDialog();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [carrierType, setCarrierType] = useState(template.carrier_type ?? "");
  const [isPublished, setIsPublished] = useState(template.is_published);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateCourseTemplate(template.id, {
        name,
        description,
        carrier_type: carrierType || undefined,
        is_published: isPublished,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!await confirm({ title: "Delete Template", description: `This will permanently delete "${template.name}". This cannot be undone.`, confirmLabel: "Delete", variant: "destructive" })) return;
    setDeleting(true);
    try {
      await deleteCourseTemplate(template.id);
      router.push("/super-admin/training/templates");
    } catch (err: any) {
      setError(err.message ?? "Failed to delete");
      setDeleting(false);
    }
  }

  return (
    <div className="bg-rf-surface-card border border-rf-border rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-rf-ink-700">Template Settings</h2>

      {error && (
        <div className="p-2 bg-rf-danger-bg border border-red-200 rounded text-xs text-red-700">{error}</div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-rf-ink-500 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-rf-ink-500 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-rf-ink-500 mb-1">Carrier Type</label>
          <select
            value={carrierType}
            onChange={(e) => setCarrierType(e.target.value)}
            className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue bg-rf-surface-card"
          >
            {CARRIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 pt-1 border-t border-rf-ink-100">
          <button
            type="button"
            role="switch"
            aria-checked={isPublished}
            onClick={() => setIsPublished((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              isPublished ? "bg-rf-success" : "bg-rf-ink-300"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-rf-surface-card shadow transition-transform ${
                isPublished ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-rf-ink-700">
            {isPublished ? "Published" : "Draft"}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-rf-blue text-white text-xs font-medium rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </form>

      <div className="pt-3 border-t border-rf-ink-100">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-rf-danger hover:text-rf-danger transition-colors disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete template"}
        </button>
      </div>
    </div>
  );
}
