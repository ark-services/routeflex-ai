"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCourseTemplate } from "../actions";

const CARRIER_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "fedex_pd", label: "FedEx P&D" },
  { value: "fedex_linehaul", label: "FedEx Linehaul" },
  { value: "amazon_dsp", label: "Amazon DSP" },
  { value: "custom", label: "Custom" },
];

export default function NewTrainingTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [carrierType, setCarrierType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createCourseTemplate({
        name,
        description: description || undefined,
        carrier_type: carrierType || undefined,
      });
      router.push(`/super-admin/training/templates/${id}`);
    } catch (err: any) {
      setError(err.message ?? "Failed to create template");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900">New Training Template</h1>
        <p className="text-sm text-stone-500 mt-1">
          Create a course template companies can clone and customize.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-stone-200 rounded-xl p-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">
            Template Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. FedEx P&D Safety Training"
            required
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this training curriculum"
            rows={3}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">
            Carrier Type
          </label>
          <select
            value={carrierType}
            onChange={(e) => setCarrierType(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {CARRIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating…" : "Create Template"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
