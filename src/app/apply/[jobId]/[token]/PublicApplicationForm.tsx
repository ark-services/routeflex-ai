"use client";

import { useState } from "react";
import { submitApplication } from "./actions";

type FormField = {
  field_id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  settings: Record<string, any>;
};

type Form = {
  form_id: string;
  job_id: string;
  company_id: string;
  title: string;
  description: string;
  job_title: string;
  company_name: string;
};

export default function PublicApplicationForm({
  jobId,
  token,
  form,
  fields,
}: {
  jobId: string;
  token: string;
  form: Form;
  fields: FormField[];
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    // Client-side validation for required fields
    const requiredFields = fields.filter(f => f.required);
    for (const field of requiredFields) {
      const value = formData.get(field.key);

      if (field.type === 'file') {
        if (!value || !(value instanceof File) || value.size === 0) {
          setError(`${field.label} is required`);
          setIsSubmitting(false);
          return;
        }
      } else if (!value || (typeof value === 'string' && !value.trim())) {
        setError(`${field.label} is required`);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      console.log('[Form] Submitting application...');
      const result = await submitApplication(jobId, token, formData);

      if (result.error) {
        console.error('[Form] Submission failed:', result.error);
        setError(result.error);
        setIsSubmitting(false);
      } else {
        console.log('[Form] Submission successful:', result.applicantId);
        setSubmitted(true);
      }
    } catch (err) {
      console.error('[Form] Unexpected submission error:', err);
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
        <p className="text-gray-600">
          Thank you for applying to {form.job_title} at {form.company_name}.
          We'll review your application and get back to you soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {form.description && (
        <p className="text-gray-600 mb-6">{form.description}</p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {fields.map((field) => (
        <div key={field.field_id}>
          <label
            htmlFor={field.key}
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>

          {field.type === "text" && (
            <input
              id={field.key}
              type="text"
              name={field.key}
              required={field.required}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}

          {field.type === "textarea" && (
            <textarea
              id={field.key}
              name={field.key}
              required={field.required}
              rows={field.settings?.rows || 4}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}

          {field.type === "email" && (
            <input
              id={field.key}
              type="email"
              name={field.key}
              required={field.required}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}

          {field.type === "phone" && (
            <input
              id={field.key}
              type="tel"
              name={field.key}
              required={field.required}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}

          {field.type === "number" && (
            <input
              id={field.key}
              type="number"
              name={field.key}
              required={field.required}
              min={field.settings?.min}
              max={field.settings?.max}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}

          {field.type === "date" && (
            <input
              id={field.key}
              type="date"
              name={field.key}
              required={field.required}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}

          {field.type === "file" && (
            <div>
              <input
                id={field.key}
                type="file"
                name={field.key}
                required={field.required}
                accept={field.settings?.accept || ".pdf,.doc,.docx"}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {field.settings?.accept && (
                <p className="text-xs text-gray-500 mt-1">
                  Accepted formats: {field.settings.accept}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Maximum file size: 10MB
              </p>
            </div>
          )}

          {field.type === "checkbox" && (
            <div className="flex items-center gap-2">
              <input
                id={field.key}
                type="checkbox"
                name={field.key}
                required={field.required}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">{field.label}</span>
            </div>
          )}

          {field.type === "radio" && field.settings?.options && (
            <div className="space-y-2">
              {field.settings.options.map((option: string, idx: number) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    id={`${field.key}-${idx}`}
                    type="radio"
                    name={field.key}
                    value={option}
                    required={field.required}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <label htmlFor={`${field.key}-${idx}`} className="text-sm text-gray-700">
                    {option}
                  </label>
                </div>
              ))}
            </div>
          )}

          {field.type === "select" && field.settings?.options && (
            <select
              id={field.key}
              name={field.key}
              required={field.required}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select an option</option>
              {field.settings.options.map((option: string, idx: number) => (
                <option key={idx} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 px-6 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
      >
        {isSubmitting ? "Submitting..." : "Submit Application"}
      </button>

      <p className="text-xs text-gray-500 text-center">
        By submitting this form, you agree to the processing of your personal data in accordance
        with our privacy policy.
      </p>
    </form>
  );
}
