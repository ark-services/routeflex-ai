"use client";

import { useRef, useState, useEffect } from "react";
import { uploadFormLogo, deleteFormLogo } from "./actions";

export type DesignSettings = {
  backgroundColor: string;
  logoUrl: string;
  logoPath: string;
};

type DesignPanelProps = {
  companyId: string;
  formId: string;
  designSettings: DesignSettings;
  onChange: (settings: DesignSettings) => Promise<void>;
};

const BG_PRESETS = [
  { label: "Light Gray", value: "#f9fafb" },
  { label: "White", value: "#ffffff" },
  { label: "Light Blue", value: "#eff6ff" },
  { label: "Light Green", value: "#f0fdf4" },
  { label: "Light Purple", value: "#faf5ff" },
  { label: "Light Pink", value: "#fdf2f8" },
  { label: "Light Yellow", value: "#fefce8" },
  { label: "Light Orange", value: "#fff7ed" },
];

export default function DesignPanel({
  companyId,
  formId,
  designSettings,
  onChange,
}: DesignPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Local color state to avoid hammering DB on every drag of color picker
  const [localColor, setLocalColor] = useState(designSettings.backgroundColor);

  useEffect(() => {
    setLocalColor(designSettings.backgroundColor);
  }, [designSettings.backgroundColor]);

  const handleBgColor = async (color: string) => {
    await onChange({ ...designSettings, backgroundColor: color });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");

    try {
      const fd = new FormData();
      fd.append("logo", file);
      const result = await uploadFormLogo(companyId, formId, fd);

      if ("error" in result) {
        setUploadError(result.error);
        return;
      }

      await onChange({ ...designSettings, logoUrl: result.url, logoPath: result.path });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    // Fire-and-forget storage delete (best effort — data is non-critical)
    if (designSettings.logoPath) {
      deleteFormLogo(designSettings.logoPath).catch(() => {});
    }
    await onChange({ ...designSettings, logoUrl: "", logoPath: "" });
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <h3 className="text-base font-semibold text-gray-900">Design</h3>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">

        {/* Background */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Background
          </h4>

          {/* Color Swatches */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {BG_PRESETS.map((c) => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => handleBgColor(c.value)}
                className={`h-9 rounded-lg border-2 transition-all ${
                  designSettings.backgroundColor === c.value
                    ? "border-blue-500 shadow-md scale-105"
                    : "border-gray-200 hover:border-gray-400"
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>

          {/* Custom Color */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Custom color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={localColor}
                onChange={(e) => setLocalColor(e.target.value)}
                onBlur={(e) => handleBgColor(e.target.value)}
                className="h-9 w-9 rounded cursor-pointer border border-gray-300 p-0.5 flex-shrink-0"
              />
              <input
                type="text"
                value={localColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setLocalColor(v);
                }}
                onBlur={(e) => {
                  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    handleBgColor(e.target.value);
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="#f9fafb"
                maxLength={7}
              />
            </div>
          </div>
        </section>

        {/* Logo & Header */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Logo &amp; Header
          </h4>

          {/* Show logo section when we have a path (persistent) or a url (just uploaded) */}
          {(designSettings.logoPath || designSettings.logoUrl) ? (
            <div>
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 mb-3 flex items-center justify-center min-h-[64px]">
                {designSettings.logoUrl ? (
                  <img
                    src={designSettings.logoUrl}
                    alt="Form logo"
                    className="max-h-12 max-w-full object-contain"
                  />
                ) : (
                  <p className="text-xs text-gray-400">Logo saved — reload to preview</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 px-3 py-2 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {uploading ? "Uploading…" : "Replace"}
                </button>
                <button
                  onClick={handleRemoveLogo}
                  className="px-3 py-2 border border-red-200 text-sm text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg p-5 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <svg
                className="mx-auto h-8 w-8 text-gray-400 mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm font-medium text-gray-600">
                {uploading ? "Uploading…" : "Upload Logo"}
              </span>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP · max 5 MB</p>
            </button>
          )}

          {uploadError && (
            <p className="mt-2 text-xs text-red-600">{uploadError}</p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleLogoUpload}
          />
        </section>
      </div>
    </div>
  );
}
