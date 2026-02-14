"use client";

import { useState, useEffect } from "react";
import { createFormField, updateFormField, deleteFormField } from "./actions";

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
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
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

  const handleAddField = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const newField = await createFormField(companyId, jobId, form.id, {
        key: (formData.get("key") as string).toLowerCase().replace(/\s+/g, "_"),
        label: formData.get("label") as string,
        type: formData.get("type") as string,
        required: formData.get("required") === "on",
      });

      setFields([...fields, newField]);
      setShowAddField(false);
      e.currentTarget.reset();
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
      setEditingField(null);
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
    } catch (error) {
      console.error("Failed to delete field:", error);
      alert("Failed to delete field");
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
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

      {/* Form Fields List */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Form Fields</h2>
              <p className="text-sm text-gray-600 mt-1">
                These fields define your application form and board columns
              </p>
            </div>

            <div className="divide-y">
              {fields.map((field) => (
                <div key={field.id} className="p-4 hover:bg-gray-50">
                  {editingField === field.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        defaultValue={field.label}
                        className="w-full px-3 py-2 border rounded-md"
                        placeholder="Field label"
                        onBlur={(e) =>
                          handleUpdateField(field.id, { label: e.target.value })
                        }
                      />
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            defaultChecked={field.required}
                            onChange={(e) =>
                              handleUpdateField(field.id, { required: e.target.checked })
                            }
                          />
                          <span className="text-sm text-gray-700">Required</span>
                        </label>
                        <button
                          onClick={() => setEditingField(null)}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{field.label}</h3>
                          {field.required && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                              Required
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          Type: {field.type} • Key: {field.key}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingField(field.id)}
                          className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteField(field.id)}
                          className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add Field Button */}
            <div className="p-4 border-t bg-gray-50">
              {showAddField ? (
                <form onSubmit={handleAddField} className="space-y-3">
                  <input
                    name="label"
                    type="text"
                    placeholder="Field label (e.g., Years of Experience)"
                    required
                    className="w-full px-3 py-2 border rounded-md"
                  />
                  <input
                    name="key"
                    type="text"
                    placeholder="Field key (e.g., years_experience)"
                    required
                    className="w-full px-3 py-2 border rounded-md"
                  />
                  <select
                    name="type"
                    required
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="text">Text (short answer)</option>
                    <option value="textarea">Textarea (long answer)</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="file">File Upload</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="radio">Radio Buttons</option>
                    <option value="select">Dropdown</option>
                  </select>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="required" />
                    <span className="text-sm text-gray-700">Required field</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Add Field
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddField(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowAddField(true)}
                  className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-md text-gray-600 hover:border-gray-400 hover:text-gray-700"
                >
                  + Add Field
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

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
