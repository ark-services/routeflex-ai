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

// Shared input className — softer borders, refined focus ring, consistent sizing
const inputCls =
  "w-full px-3.5 py-2.5 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors";

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
      <div className="text-center py-10">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-green-50 rounded-full mb-4">
          <svg
            className="w-7 h-7 text-green-500"
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
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Application submitted</h2>
        <p className="text-sm text-stone-500 max-w-sm mx-auto">
          Thank you for applying to {form.job_title} at {form.company_name}.
          We&apos;ll review your application and get back to you soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Form description — muted, sits naturally above fields */}
      {form.description && (
        <p className="text-sm text-stone-500 leading-relaxed -mt-1 mb-2">
          {form.description}
        </p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {fields.filter((field) => !field.settings?.hidden).map((field) => (
        <div key={field.field_id} className="space-y-1.5">
          <label
            htmlFor={field.key}
            className="block text-sm font-medium text-stone-700"
          >
            {field.label}
            {field.required && (
              <span className="text-red-400 ml-1" aria-hidden="true">*</span>
            )}
          </label>

          {/* Optional description */}
          {field.settings?.description && (
            <p className="text-xs text-stone-500">{field.settings.description}</p>
          )}

          {/* Optional question image */}
          {field.settings?.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={field.settings.imageUrl}
              alt=""
              className="w-full rounded-lg object-contain max-h-60 border border-stone-200 bg-stone-50"
            />
          )}

          {field.type === "text" && (
            <input
              id={field.key}
              type="text"
              name={field.key}
              required={field.required}
              placeholder={field.settings?.placeholder}
              className={inputCls}
            />
          )}

          {field.type === "textarea" && (
            <textarea
              id={field.key}
              name={field.key}
              required={field.required}
              rows={field.settings?.rows || 4}
              placeholder={field.settings?.placeholder}
              className={`${inputCls} resize-y`}
            />
          )}

          {field.type === "email" && (
            <input
              id={field.key}
              type="email"
              name={field.key}
              required={field.required}
              placeholder={field.settings?.placeholder}
              className={inputCls}
            />
          )}

          {field.type === "phone" && (
            <input
              id={field.key}
              type="tel"
              name={field.key}
              required={field.required}
              placeholder={field.settings?.placeholder}
              className={inputCls}
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
              className={inputCls}
            />
          )}

          {field.type === "date" && (
            <input
              id={field.key}
              type="date"
              name={field.key}
              required={field.required}
              className={inputCls}
            />
          )}

          {field.type === "file" && (
            <div className="space-y-1">
              <input
                id={field.key}
                type="file"
                name={field.key}
                required={field.required}
                accept={field.settings?.accept || ".pdf,.doc,.docx"}
                className="w-full text-sm text-stone-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200 file:transition-colors cursor-pointer"
              />
              <p className="text-xs text-stone-400">
                {field.settings?.accept
                  ? `Accepted: ${field.settings.accept} · `
                  : ""}
                Max 10 MB
              </p>
            </div>
          )}

          {field.type === "checkbox" && (
            <div className="flex items-center gap-2.5">
              <input
                id={field.key}
                type="checkbox"
                name={field.key}
                required={field.required}
                defaultChecked={field.settings?.defaultChecked ?? false}
                className="h-4 w-4 rounded border-stone-300 text-blue-600 focus:ring-blue-500/30"
              />
              <span className="text-sm text-stone-600">{field.label}</span>
            </div>
          )}

          {field.type === "radio" && field.settings?.options && (
            <div className="space-y-2.5">
              {field.settings.options.map((option: string, idx: number) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <input
                    id={`${field.key}-${idx}`}
                    type="radio"
                    name={field.key}
                    value={option}
                    required={field.required}
                    className="h-4 w-4 border-stone-300 text-blue-600 focus:ring-blue-500/30"
                  />
                  <label
                    htmlFor={`${field.key}-${idx}`}
                    className="text-sm text-stone-700"
                  >
                    {option}
                  </label>
                </div>
              ))}
            </div>
          )}

          {field.type === "location" && (
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <svg className="h-4 w-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <input
                id={field.key}
                type="text"
                name={field.key}
                required={field.required}
                placeholder={field.settings?.placeholder || "123 Main St, City, State"}
                className={`${inputCls} pl-9`}
              />
            </div>
          )}

          {field.type === "select" && field.settings?.options && (
            <select
              id={field.key}
              name={field.key}
              required={field.required}
              className={inputCls}
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

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-6 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Submitting…" : "Submit Application"}
        </button>

        <p className="text-xs text-stone-400 text-center mt-3">
          By submitting this form, you agree to the processing of your personal
          data in accordance with our privacy policy.
        </p>
      </div>

    </form>
  );
}
