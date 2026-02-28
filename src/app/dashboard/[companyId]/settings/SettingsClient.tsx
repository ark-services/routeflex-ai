"use client";

import { useState, useRef } from "react";
import { Upload, X, Building2 } from "lucide-react";
import { uploadCompanyLogo, removeCompanyLogo, updateCompanyName } from "./actions";

const PLAN_COLORS: Record<string, string> = {
  free:       "bg-rf-ink-100 text-rf-ink-500",
  basic:      "bg-rf-blue-tint text-rf-blue",
  pro:        "bg-violet-50 text-violet-700",
  enterprise: "bg-rf-warning-bg text-rf-warning",
};

interface Props {
  companyId: string;
  company: {
    id: string;
    name: string;
    logo_url: string | null;
    lms_enabled: boolean;
  };
  planId: string;
  actionsUsed: number;
  actionsQuota: number;
}

export function SettingsClient({ companyId, company, planId, actionsUsed, actionsQuota }: Props) {
  const [name, setName] = useState(company.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(company.logo_url);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      await updateCompanyName(companyId, name);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (err: any) {
      setNameError(err.message ?? "Failed to save");
    } finally {
      setSavingName(false);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setLogoError(null);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const result = await uploadCompanyLogo(companyId, formData);
      if (!result.success) {
        setLogoError(result.error);
      } else {
        setLogoUrl(result.logoUrl);
      }
    } catch (err: any) {
      setLogoError(err.message ?? "Upload failed");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    if (!confirm("Remove company logo?")) return;
    try {
      await removeCompanyLogo(companyId);
      setLogoUrl(null);
    } catch (err: any) {
      setLogoError(err.message ?? "Failed to remove");
    }
  }

  return (
    <div className="space-y-6">
      {/* Company Name */}
      <div className="bg-rf-surface-card border border-rf-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-rf-ink-700 mb-4">Company Name</h2>
        {nameError && (
          <div className="mb-3 p-2 bg-rf-danger-bg border border-red-200 rounded text-xs text-red-700">{nameError}</div>
        )}
        <form onSubmit={handleSaveName} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-rf-ink-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rf-blue"
          />
          <button
            type="submit"
            disabled={savingName}
            className="px-4 py-2 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 transition-colors"
          >
            {savingName ? "Saving…" : nameSaved ? "Saved ✓" : "Save"}
          </button>
        </form>
      </div>

      {/* Company Logo */}
      <div className="bg-rf-surface-card border border-rf-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-rf-ink-700 mb-1">Company Logo</h2>
        <p className="text-xs text-rf-text-muted mb-4">
          Shown on the learner portal and training emails. Max 200KB · JPEG, PNG, GIF, WebP, SVG.
        </p>

        {logoError && (
          <div className="mb-3 p-2 bg-rf-danger-bg border border-red-200 rounded text-xs text-red-700">{logoError}</div>
        )}

        <div className="flex items-center gap-4">
          {/* Preview */}
          <div className="w-24 h-16 bg-rf-ink-100 border border-rf-border rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Company logo"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <Building2 className="w-8 h-8 text-rf-text-muted" />
            )}
          </div>

          <div className="space-y-2">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                onChange={handleLogoChange}
                className="hidden"
                id="logo-upload"
              />
              <label
                htmlFor="logo-upload"
                className={`inline-flex items-center gap-2 px-3 py-2 bg-rf-ink-100 text-rf-ink-700 text-xs font-medium rounded-lg hover:bg-rf-ink-100 transition-colors cursor-pointer ${
                  uploadingLogo ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadingLogo ? "Uploading…" : logoUrl ? "Replace Logo" : "Upload Logo"}
              </label>
            </div>

            {logoUrl && (
              <button
                onClick={handleRemoveLogo}
                className="inline-flex items-center gap-1.5 text-xs text-rf-danger hover:text-rf-danger transition-colors"
              >
                <X className="w-3 h-3" />
                Remove logo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LMS Status */}
      <div className="bg-rf-surface-card border border-rf-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-rf-ink-700 mb-1">Training Module</h2>
        <p className="text-xs text-rf-text-secondary">
          {company.lms_enabled
            ? "The training module is enabled for your account."
            : "The training module is not enabled for your account. Contact your account admin to upgrade your plan."}
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${company.lms_enabled ? "bg-rf-success" : "bg-rf-ink-300"}`}
          />
          <span className={`text-xs font-medium ${company.lms_enabled ? "text-rf-success" : "text-rf-text-secondary"}`}>
            {company.lms_enabled ? "Enabled" : "Not enabled"}
          </span>
        </div>
      </div>

      {/* Subscription */}
      <div className="bg-rf-surface-card border border-rf-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-rf-ink-700 mb-3">Subscription</h2>
        <div className="flex items-center gap-3 mb-3">
          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${PLAN_COLORS[planId] ?? PLAN_COLORS.free}`}>
            {planId}
          </span>
          <span className="text-xs text-rf-text-secondary">
            {actionsUsed.toLocaleString()} / {actionsQuota.toLocaleString()} actions this period
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-rf-ink-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-rf-blue transition-all"
            style={{ width: `${actionsQuota > 0 ? Math.min(100, (actionsUsed / actionsQuota) * 100) : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}
