"use client";

import { useState, useEffect, useRef } from "react";
import {
  createFormField,
  updateFormField,
  deleteFormField,
  updateFormMeta,
  reconcileSyncedColumns,
} from "./actions";
import FieldCard from "./FieldCard";
import FieldTypePicker from "./FieldTypePicker";
import QuestionSettingsPanel from "./QuestionSettingsPanel";
import FormBuilderSidebar from "./FormBuilderSidebar";
import DesignPanel, { DesignSettings } from "./DesignPanel";
import SettingsPanel, { FormSettingsType } from "./SettingsPanel";
import Toast from "./Toast";

type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  sort_order: number;
  settings: Record<string, any>;
};

type Form = {
  id: string;
  public_token: string;
  title: string;
  description: string;
  settings: Record<string, any> | null;
};

type ActiveTab = "edit" | "design" | "settings";

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "design", label: "Design" },
  { id: "settings", label: "Settings" },
];

export default function FormBuilder({
  companyId,
  jobId,
  form,
  fields: initialFields,
  jobTitle,
  logoSignedUrl = "",
}: {
  companyId: string;
  jobId: string;
  form: Form;
  fields: FormField[];
  jobTitle: string;
  /** Fresh 1-hour signed URL generated server-side from the stored logoPath. */
  logoSignedUrl?: string;
}) {
  // ─── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("edit");

  // ─── Fields state ─────────────────────────────────────────────────────────
  const [fields, setFields] = useState(initialFields);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [addFieldAt, setAddFieldAt] = useState<number | null>(null);

  // ─── Public URL ───────────────────────────────────────────────────────────
  const [publicUrl, setPublicUrl] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPublicUrl(
        `${window.location.origin}/apply/${jobId}/${form.public_token}`
      );
    }
  }, [jobId, form.public_token]);

  // ─── Toast ────────────────────────────────────────────────────────────────
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("Copied!");

  const showCopiedToast = (msg = "Copied!") => {
    setToastMessage(msg);
    setShowToast(true);
  };

  // ─── Sync reconcile ───────────────────────────────────────────────────────
  // Runs whenever sync is ON to guarantee every question has a board column.
  const runReconcile = async () => {
    try {
      const { created, linked } = await reconcileSyncedColumns(
        companyId,
        jobId,
        form.id
      );
      const total = created + linked;
      if (total > 0) {
        showCopiedToast(
          `Sync restored ${total} missing board column${total === 1 ? "" : "s"}`
        );
      }
    } catch {
      // Non-fatal — silently ignore reconcile errors to avoid blocking UX
    }
  };

  // Run once on mount when sync is already enabled
  useEffect(() => {
    if (formSettings.syncQuestions) {
      runReconcile();
    }
    // Only on initial mount — formSettings is stable at this point
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Share modal ──────────────────────────────────────────────────────────
  const [showShareModal, setShowShareModal] = useState(false);

  // ─── Form title / description (inline-editable) ───────────────────────────
  const [formTitle, setFormTitle] = useState(form.title || "Application Form");
  const [formDescription, setFormDescription] = useState(form.description || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus();
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingDescription) descriptionRef.current?.focus();
  }, [isEditingDescription]);

  const handleTitleSave = async () => {
    const trimmed = formTitle.trim();
    if (!trimmed) {
      setFormTitle(form.title || "Application Form");
      setIsEditingTitle(false);
      return;
    }
    setIsEditingTitle(false);
    if (trimmed !== form.title) {
      await updateFormMeta(companyId, jobId, form.id, { title: trimmed });
    }
  };

  const handleDescriptionSave = async () => {
    setIsEditingDescription(false);
    if (formDescription !== (form.description || "")) {
      await updateFormMeta(companyId, jobId, form.id, {
        description: formDescription,
      });
    }
  };

  // ─── Settings (design + form) ─────────────────────────────────────────────
  // Keep a merged copy of the full settings object so writes never lose keys.
  const initialSettings = form.settings || {};

  const [currentSettings, setCurrentSettings] = useState<Record<string, any>>(initialSettings);

  const [designSettings, setDesignSettings] = useState<DesignSettings>({
    backgroundColor: initialSettings.design?.backgroundColor ?? "#f9fafb",
    // logoPath is the persistent storage key (saved to DB).
    // logoUrl is ephemeral (signed URL, not saved); we seed it from the
    // server-generated prop so it's always valid on first render.
    logoPath: initialSettings.design?.logoPath ?? "",
    logoUrl: logoSignedUrl,
  });

  const [formSettings, setFormSettings] = useState<FormSettingsType>({
    tags: initialSettings.tags ?? [],
    syncQuestions: initialSettings.syncQuestions ?? true,
  });

  const handleDesignChange = async (newDesign: DesignSettings) => {
    setDesignSettings(newDesign);
    // Only persist stable values: backgroundColor and logoPath.
    // logoUrl is a short-lived signed URL — storing it in the DB would be
    // misleading once it expires (typically after 1 hour).
    const persistDesign = {
      backgroundColor: newDesign.backgroundColor,
      logoPath: newDesign.logoPath,
    };
    const merged = { ...currentSettings, design: persistDesign };
    setCurrentSettings(merged);
    await updateFormMeta(companyId, jobId, form.id, { settings: merged });
  };

  const handleFormSettingsChange = async (newFs: FormSettingsType) => {
    const syncToggledOn = newFs.syncQuestions && !formSettings.syncQuestions;
    setFormSettings(newFs);
    const merged = {
      ...currentSettings,
      tags: newFs.tags,
      syncQuestions: newFs.syncQuestions,
    };
    setCurrentSettings(merged);
    await updateFormMeta(companyId, jobId, form.id, { settings: merged });

    // When the user turns sync ON, immediately repair any missing board columns
    if (syncToggledOn) {
      await runReconcile();
    }
  };

  // ─── Field operations ─────────────────────────────────────────────────────
  const handleAddFieldType = async (type: string) => {
    const defaultLabels: Record<string, string> = {
      text: "Short Answer",
      textarea: "Long Answer",
      email: "Email Address",
      phone: "Phone Number",
      number: "Number",
      date: "Date",
      file: "Upload File",
      radio: "Choose One",
      checkbox: "Select All That Apply",
      select: "Select from Dropdown",
    };

    try {
      const label = defaultLabels[type] || "New Question";
      const key = `${type}_${Date.now()}`.toLowerCase();
      const newField = await createFormField(companyId, jobId, form.id, {
        key,
        label,
        type,
        required: false,
      });
      setFields([...fields, newField]);
      setAddFieldAt(null);
      setSelectedFieldId(newField.id);
    } catch {
      alert("Failed to create field");
    }
  };

  const handleUpdateField = async (
    fieldId: string,
    updates: Partial<FormField>
  ) => {
    try {
      await updateFormField(
        companyId,
        jobId,
        fieldId,
        updates,
        formSettings.syncQuestions
      );
      setFields(fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)));
    } catch {
      alert("Failed to update field");
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (
      !confirm(
        "Are you sure? This will hide the field but preserve existing applicant data."
      )
    )
      return;
    try {
      await deleteFormField(companyId, jobId, fieldId);
      setFields(fields.filter((f) => f.id !== fieldId));
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null);
        setShowSettingsPanel(false);
      }
    } catch {
      alert("Failed to delete field");
    }
  };

  const handleDuplicateField = async (fieldId: string) => {
    const src = fields.find((f) => f.id === fieldId);
    if (!src) return;
    try {
      const newField = await createFormField(companyId, jobId, form.id, {
        key: `${src.key}_copy_${Date.now()}`,
        label: `${src.label} (Copy)`,
        type: src.type,
        required: src.required,
        settings: { ...src.settings },
      });
      setFields([...fields, newField]);
      setSelectedFieldId(newField.id);
    } catch {
      alert("Failed to duplicate field");
    }
  };

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        {/* Left: breadcrumb-style label */}
        <div className="flex-shrink-0 min-w-0">
          <h1 className="text-base font-semibold text-gray-900 truncate">
            Application Form
          </h1>
          <p className="text-xs text-gray-500 truncate">{jobTitle}</p>
        </div>

        {/* Center: tab switcher */}
        <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Preview + Share Form */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => publicUrl && window.open(publicUrl, "_blank")}
            disabled={!publicUrl}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Preview
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Share Form
          </button>
        </div>
      </div>

      {/* ── Main body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <FormBuilderSidebar
          fields={fields}
          selectedFieldId={selectedFieldId}
          onSelectField={(id) => {
            setSelectedFieldId(id);
            document
              .getElementById(`field-${id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />

        {/* Canvas — full-page background driven by design settings, matching live page */}
        <div
          className="flex-1 overflow-auto p-6"
          style={{ backgroundColor: designSettings.backgroundColor }}
        >
          <div className="max-w-2xl mx-auto">
            {/* Form header card — two-section layout matching the live apply page:
                 top section: logo + title (border-b divider)
                 bottom section: description (inline-editable) */}
            <div className="mb-5 bg-white rounded-2xl border border-stone-200 shadow-[0_2px_16px_rgba(0,0,0,0.08)] overflow-hidden">

              {/* Header section: logo + title */}
              <div className="px-8 pt-8 pb-6 border-b border-stone-100">
                {designSettings.logoUrl && (
                  <img
                    src={designSettings.logoUrl}
                    alt="Form logo"
                    className="max-h-10 object-contain mb-5"
                  />
                )}
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSave();
                      else if (e.key === "Escape") {
                        setFormTitle(form.title || "Application Form");
                        setIsEditingTitle(false);
                      }
                    }}
                    className="w-full text-2xl font-bold text-stone-900 leading-tight border-b-2 border-blue-500 focus:outline-none bg-transparent pb-0.5"
                  />
                ) : (
                  <div
                    className="group/title flex items-center gap-2 cursor-text"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    <h2 className="text-2xl font-bold text-stone-900 leading-tight">
                      {formTitle}
                    </h2>
                    <svg
                      className="w-4 h-4 text-stone-400 opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Description section — mirrors where description sits in the live form body */}
              <div className="px-8 py-6">
                <div className="group/desc">
                  {isEditingDescription ? (
                    <textarea
                      ref={descriptionRef}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      onBlur={handleDescriptionSave}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setFormDescription(form.description || "");
                          setIsEditingDescription(false);
                        }
                      }}
                      placeholder="Add a form description…"
                      rows={2}
                      className="w-full text-sm text-stone-500 leading-relaxed border-b border-blue-500 focus:outline-none bg-transparent resize-none"
                    />
                  ) : (
                    <div
                      className="flex items-start gap-2 cursor-text"
                      onClick={() => setIsEditingDescription(true)}
                    >
                      <p className="text-sm text-stone-500 leading-relaxed flex-1 min-h-[20px]">
                        {formDescription || (
                          <span className="text-stone-300 italic">
                            Click to add a form description…
                          </span>
                        )}
                      </p>
                      <svg
                        className="w-4 h-4 text-stone-400 opacity-0 group-hover/desc:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Field Cards */}
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} id={`field-${field.id}`}>
                  <FieldCard
                    field={field}
                    isSelected={selectedFieldId === field.id}
                    onSelect={() => setSelectedFieldId(field.id)}
                    onUpdate={(updates) => handleUpdateField(field.id, updates)}
                    onDelete={() => handleDeleteField(field.id)}
                    onDuplicate={() => handleDuplicateField(field.id)}
                    onOpenSettings={() => {
                      setSelectedFieldId(field.id);
                      setShowSettingsPanel(true);
                      setActiveTab("edit");
                    }}
                  />

                  {addFieldAt === index && (
                    <div className="my-4">
                      <FieldTypePicker
                        onSelect={handleAddFieldType}
                        onCancel={() => setAddFieldAt(null)}
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* Add field at end */}
              {addFieldAt === fields.length ? (
                <div className="mt-4">
                  <FieldTypePicker
                    onSelect={handleAddFieldType}
                    onCancel={() => setAddFieldAt(null)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddFieldAt(fields.length)}
                  className="w-full px-6 py-4 border-2 border-dashed border-stone-200 rounded-2xl text-stone-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-all text-sm font-medium"
                >
                  + Add Question
                </button>
              )}
            </div>

            {/* Empty state */}
            {fields.length === 0 && addFieldAt === null && (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-16 w-16 text-gray-300 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No questions yet
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Start building your form by adding questions
                </p>
                <button
                  onClick={() => setAddFieldAt(0)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Add Your First Question
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — context-dependent */}
        {activeTab === "edit" && showSettingsPanel && selectedField && (
          <QuestionSettingsPanel
            field={selectedField}
            onUpdate={(updates) => handleUpdateField(selectedField.id, updates)}
            onClose={() => setShowSettingsPanel(false)}
          />
        )}
        {activeTab === "design" && (
          <DesignPanel
            companyId={companyId}
            formId={form.id}
            designSettings={designSettings}
            onChange={handleDesignChange}
          />
        )}
        {activeTab === "settings" && (
          <SettingsPanel
            formSettings={formSettings}
            publicUrl={publicUrl}
            onChange={handleFormSettingsChange}
            onCopyLink={(url) => {
              navigator.clipboard.writeText(url);
              showCopiedToast("Link copied to clipboard");
            }}
          />
        )}
      </div>

      {/* ── Share Modal ────────────────────────────────────────────────────── */}
      {showShareModal && (
        <div
          className="fixed inset-0 bg-gray-900/20 flex items-center justify-center z-50"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Share Form</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 mb-4">
                This form is public and available to anyone with the link.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={publicUrl}
                  readOnly
                  onChange={() => {}}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono text-gray-700 focus:outline-none"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    showCopiedToast("Form link copied to clipboard");
                    setShowShareModal(false);
                  }}
                  disabled={!publicUrl}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {showToast && (
        <Toast message={toastMessage} onClose={() => setShowToast(false)} />
      )}
    </div>
  );
}
