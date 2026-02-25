"use client";

import { useState, useRef } from "react";
import { Upload, X, Building2 } from "lucide-react";
import { uploadCompanyLogo, removeCompanyLogo, updateCompanyName } from "./actions";

interface Props {
  companyId: string;
  company: {
    id: string;
    name: string;
    logo_url: string | null;
    lms_enabled: boolean;
  };
}

export function SettingsClient({ companyId, company }: Props) {
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
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-stone-700 mb-4">Company Name</h2>
        {nameError && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{nameError}</div>
        )}
        <form onSubmit={handleSaveName} className="flex items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={savingName}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingName ? "Saving…" : nameSaved ? "Saved ✓" : "Save"}
          </button>
        </form>
      </div>

      {/* Company Logo */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-stone-700 mb-1">Company Logo</h2>
        <p className="text-xs text-stone-400 mb-4">
          Shown on the learner portal and training emails. Max 200KB · JPEG, PNG, GIF, WebP, SVG.
        </p>

        {logoError && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{logoError}</div>
        )}

        <div className="flex items-center gap-4">
          {/* Preview */}
          <div className="w-24 h-16 bg-stone-100 border border-stone-200 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Company logo"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <Building2 className="w-8 h-8 text-stone-300" />
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
                className={`inline-flex items-center gap-2 px-3 py-2 bg-stone-100 text-stone-700 text-xs font-medium rounded-lg hover:bg-stone-200 transition-colors cursor-pointer ${
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
                className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 transition-colors"
              >
                <X className="w-3 h-3" />
                Remove logo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LMS Status */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-stone-700 mb-1">Training Module</h2>
        <p className="text-xs text-stone-500">
          {company.lms_enabled
            ? "The training module is enabled for your account."
            : "The training module is not enabled for your account. Contact support to upgrade."}
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${company.lms_enabled ? "bg-green-500" : "bg-stone-300"}`}
          />
          <span className={`text-xs font-medium ${company.lms_enabled ? "text-green-700" : "text-stone-500"}`}>
            {company.lms_enabled ? "Enabled" : "Not enabled"}
          </span>
        </div>
      </div>
    </div>
  );
}
