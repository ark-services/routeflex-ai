"use client";

import { useState, useEffect } from "react";
import { createFormField, updateFormField, deleteFormField } from "./actions";
import FieldCard from "./FieldCard";
import FieldTypePicker from "./FieldTypePicker";
import QuestionSettingsPanel from "./QuestionSettingsPanel";
import FormBuilderSidebar from "./FormBuilderSidebar";
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
};

export default function FormBuilder({
  companyId,
  jobId,
  form,
  fields: initialFields,
  jobTitle,
}: {
  companyId: string;
  jobId: string;
  form: Form;
  fields: FormField[];
  jobTitle: string;
}) {
  const [fields, setFields] = useState(initialFields);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [addFieldAt, setAddFieldAt] = useState<number | null>(null);
  const [publicUrl, setPublicUrl] = useState<string>("");
  const [showToast, setShowToast] = useState(false);

  // Set publicUrl on client side only to avoid SSR "window is not defined" error
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPublicUrl(`${window.location.origin}/apply/${jobId}/${form.public_token}`);
    }
  }, [jobId, form.public_token]);

  const handleCopyLink = () => {
    if (!publicUrl) {
      console.warn("Public URL not yet available");
      return;
    }
    navigator.clipboard.writeText(publicUrl);
    setShowToast(true);
    setShowShareModal(false);
  };

  const handleAddFieldType = async (type: string) => {
    try {
      // Generate a default label based on type
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

      // Auto-select the new field
      setSelectedFieldId(newField.id);
    } catch (error) {
      console.error("Failed to create field:", error);
      alert("Failed to create field");
    }
  };

  const handleUpdateField = async (fieldId: string, updates: Partial<FormField>) => {
    try {
      await updateFormField(companyId, jobId, fieldId, updates);
      setFields(
        fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
      );
    } catch (error) {
      console.error("Failed to update field:", error);
      alert("Failed to update field");
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm("Are you sure? This will hide the field but preserve existing applicant data.")) {
      return;
    }

    try {
      await deleteFormField(companyId, jobId, fieldId);
      setFields(fields.filter((f) => f.id !== fieldId));

      // Deselect if the deleted field was selected
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null);
        setShowSettingsPanel(false);
      }
    } catch (error) {
      console.error("Failed to delete field:", error);
      alert("Failed to delete field");
    }
  };

  const handleDuplicateField = async (fieldId: string) => {
    const fieldToDuplicate = fields.find((f) => f.id === fieldId);
    if (!fieldToDuplicate) return;

    try {
      const newField = await createFormField(companyId, jobId, form.id, {
        key: `${fieldToDuplicate.key}_copy_${Date.now()}`,
        label: `${fieldToDuplicate.label} (Copy)`,
        type: fieldToDuplicate.type,
        required: fieldToDuplicate.required,
        settings: { ...fieldToDuplicate.settings },
      });

      setFields([...fields, newField]);

      // Auto-select the new field
      setSelectedFieldId(newField.id);
    } catch (error) {
      console.error("Failed to duplicate field:", error);
      alert("Failed to duplicate field");
    }
  };

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  return (
    <div className="h-full flex bg-gray-50">
      {/* Left Sidebar - Form Navigation */}
      <FormBuilderSidebar
        fields={fields}
        selectedFieldId={selectedFieldId}
        onSelectField={(fieldId) => {
          setSelectedFieldId(fieldId);
          // Optionally scroll to the field
          const fieldElement = document.getElementById(`field-${fieldId}`);
          if (fieldElement) {
            fieldElement.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Application Form</h1>
            <p className="text-sm text-gray-600 mt-1">{jobTitle}</p>
          </div>
          <button
            onClick={() => setShowShareModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            Share Form
          </button>
        </div>

        {/* Form Builder Canvas */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl mx-auto">
            {/* Form Header Card */}
            <div className="mb-6 bg-white rounded-xl border-2 border-gray-200 shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {form.title || "Application Form"}
              </h2>
              <p className="text-sm text-gray-600">
                {form.description || "Please fill out the form below to apply for this position."}
              </p>
            </div>

            {/* Field Cards */}
            <div className="space-y-6">
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
                    }}
                  />

                  {/* Add Field Between Cards */}
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

              {/* Add Field at End */}
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
                  className="w-full px-6 py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all font-medium"
                >
                  + Add Question
                </button>
              )}
            </div>

            {/* Empty State */}
            {fields.length === 0 && addFieldAt === null && (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No form fields yet
                </h3>
                <p className="text-sm text-gray-600 mb-6">
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
      </div>

      {/* Question Settings Panel (Right Side) */}
      {showSettingsPanel && selectedField && (
        <QuestionSettingsPanel
          field={selectedField}
          onUpdate={(updates) => handleUpdateField(selectedField.id, updates)}
          onClose={() => setShowSettingsPanel(false)}
        />
      )}

      {/* Share Modal - Monday Style */}
      {showShareModal && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-20 flex items-center justify-center z-50"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">
                Share Form
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 mb-4">
                This form is public and available to anyone with the link
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={publicUrl}
                  readOnly
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleCopyLink}
                  disabled={!publicUrl}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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

      {/* Success Toast */}
      {showToast && (
        <Toast
          message="Form link copied to clipboard"
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
}
