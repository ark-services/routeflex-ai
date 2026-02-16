"use client";

import { useState, useEffect } from "react";
import { createFormField, updateFormField, deleteFormField } from "./actions";
import FieldCard from "./FieldCard";
import FieldTypePicker from "./FieldTypePicker";
import QuestionSettingsPanel from "./QuestionSettingsPanel";
import FormBuilderSidebar from "./FormBuilderSidebar";

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
    alert("Link copied to clipboard!");
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

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Share Application Form
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Share this link with candidates to apply for this position:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={publicUrl}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-md bg-gray-50 text-sm"
                />
                <button
                  onClick={handleCopyLink}
                  disabled={!publicUrl}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Copy Link
                </button>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-3 flex justify-end rounded-b-lg">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
