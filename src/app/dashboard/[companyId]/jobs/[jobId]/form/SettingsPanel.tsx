"use client";

import { useState } from "react";

export type FormSettingsType = {
  tags: string[];
  syncQuestions: boolean;
};

type SettingsPanelProps = {
  formSettings: FormSettingsType;
  publicUrl: string;
  onChange: (settings: FormSettingsType) => Promise<void>;
  onCopyLink: (url: string) => void;
};

export default function SettingsPanel({
  formSettings,
  publicUrl,
  onChange,
  onCopyLink,
}: SettingsPanelProps) {
  const [tagInput, setTagInput] = useState("");

  const handleAddTag = async () => {
    const trimmed = tagInput.trim();
    if (!trimmed || formSettings.tags.includes(trimmed)) return;
    setTagInput("");
    await onChange({ ...formSettings, tags: [...formSettings.tags, trimmed] });
  };

  const handleRemoveTag = async (tag: string) => {
    await onChange({
      ...formSettings,
      tags: formSettings.tags.filter((t) => t !== tag),
    });
  };

  const handleSyncToggle = async () => {
    await onChange({ ...formSettings, syncQuestions: !formSettings.syncQuestions });
  };

  const handleCopyLinkWithTags = () => {
    if (!publicUrl) return;
    let url = publicUrl;
    if (formSettings.tags.length > 0) {
      url = `${publicUrl}?${formSettings.tags.join("&")}`;
    }
    onCopyLink(url);
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <h3 className="text-base font-semibold text-gray-900">Settings</h3>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">

        {/* Form Tags */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Form Tags
          </h4>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            Add tracking parameters (e.g.{" "}
            <code className="bg-gray-100 px-1 rounded text-gray-700">utm_source=google</code>)
            that will be appended to the copied form link.
          </p>

          {/* Tag Chips */}
          {formSettings.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {formSettings.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="text-blue-400 hover:text-blue-700 transition-colors"
                    aria-label={`Remove ${tag}`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add Tag Input */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="utm_source=google"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleAddTag}
              disabled={!tagInput.trim()}
              className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>

          {/* Copy Link Button */}
          <button
            onClick={handleCopyLinkWithTags}
            disabled={!publicUrl}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            {formSettings.tags.length > 0 ? "Copy link with tags" : "Copy link"}
          </button>

          {formSettings.tags.length > 0 && publicUrl && (
            <p className="mt-2 text-xs text-gray-400 break-all leading-relaxed">
              {publicUrl}?{formSettings.tags.join("&")}
            </p>
          )}
        </section>

        {/* Sync Setting */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Column Sync
          </h4>
          <label className="flex items-start gap-3 cursor-pointer" onClick={handleSyncToggle}>
            <div className="flex-shrink-0 mt-0.5">
              <div
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formSettings.syncQuestions ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                    formSettings.syncQuestions ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">
                Sync questions and column titles
              </div>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                When enabled, renaming a question also updates the matching
                column title in the Applicants Board.
              </p>
            </div>
          </label>
        </section>
      </div>
    </div>
  );
}
