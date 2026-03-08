"use client";

import { useState } from "react";
import { submitApplication } from "./actions";
import { validateEmail, validatePhone } from "@/lib/validation/columnValidation";

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
  "w-full px-3.5 py-2.5 border border-rf-border rounded-lg text-sm text-rf-text-primary placeholder-rf-text-muted bg-rf-surface-card focus:outline-none focus:ring-2 focus:ring-rf-blue/30 focus:border-blue-400 transition-colors";

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
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setUploadStatus(null);

    const formData = new FormData(e.currentTarget);

    // Client-side validation for required fields + file size
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

    // Format validation for email and phone fields
    for (const field of fields.filter(f => !f.settings?.hidden)) {
      const value = formData.get(field.key);
      if (!value || typeof value !== 'string' || !value.trim()) continue;

      if (field.type === 'email') {
        const result = validateEmail(value);
        if (!result.valid) {
          setError(`${field.label}: ${result.error}`);
          setIsSubmitting(false);
          return;
        }
      }

      if (field.type === 'phone') {
        const result = validatePhone(value);
        if (!result.valid) {
          setError(`${field.label}: ${result.error}`);
          setIsSubmitting(false);
          return;
        }
      }
    }

    // Validate file sizes before uploading
    const fileFields = fields.filter(f => f.type === 'file');
    for (const field of fileFields) {
      const file = formData.get(field.key);
      if (file instanceof File && file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        setError(`"${field.label}" is ${sizeMB} MB — files must be under 10 MB. Please choose a smaller file.`);
        setIsSubmitting(false);
        return;
      }
    }

    // Upload all file fields directly to Supabase Storage from the browser.
    // This bypasses Vercel's hard 4.5 MB server-action body limit.
    const filesToUpload = fileFields.filter(f => {
      const file = formData.get(f.key);
      return file instanceof File && file.size > 0;
    });

    const filePaths: Record<string, string> = {};

    for (let i = 0; i < filesToUpload.length; i++) {
      const field = filesToUpload[i];
      const file = formData.get(field.key) as File;

      setUploadStatus(
        filesToUpload.length > 1
          ? `Uploading ${field.label} (${i + 1} of ${filesToUpload.length})…`
          : `Uploading ${field.label}…`
      );

      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('token', token);
      uploadData.append('jobId', jobId);
      uploadData.append('fieldKey', field.key);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: uploadData });

        let json: any = {};
        try { json = await res.json(); } catch { /* ignore parse error */ }

        if (!res.ok || !json.path) {
          const msg = json?.error || `Failed to upload "${field.label}".`;
          setError(`${msg} Please try again.`);
          setIsSubmitting(false);
          setUploadStatus(null);
          return;
        }
        filePaths[field.key] = json.path;
      } catch {
        setError(`Could not upload "${field.label}" — please check your internet connection and try again.`);
        setIsSubmitting(false);
        setUploadStatus(null);
        return;
      }
    }

    // Remove file entries from formData — already uploaded, paths are in filePaths.
    // Keeping File objects in the payload would re-hit Vercel's 4.5 MB edge limit.
    for (const field of fileFields) {
      formData.delete(field.key);
    }

    setUploadStatus("Submitting application…");

    try {
      console.log('[Form] Submitting application...');
      const result = await submitApplication(jobId, token, formData, filePaths);

      if (result.error) {
        console.error('[Form] Submission failed:', result.error);
        setError(result.error);
        setIsSubmitting(false);
        setUploadStatus(null);
      } else {
        console.log('[Form] Submission successful:', result.applicantId);
        setSubmitted(true);
      }
    } catch (err: any) {
      console.error('[Form] Unexpected submission error:', err);
      // Surface a more helpful message when possible
      const msg = err?.message?.includes('fetch')
        ? 'Network error — please check your connection and try again.'
        : 'Something went wrong submitting your application. Please try again.';
      setError(msg);
      setIsSubmitting(false);
      setUploadStatus(null);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-10">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-rf-success-bg rounded-full mb-4">
          <svg
            className="w-7 h-7 text-rf-success"
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
        <h2 className="text-xl font-semibold text-rf-text-primary mb-2">Application submitted</h2>
        <p className="text-sm text-rf-text-secondary max-w-sm mx-auto">
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
        <p className="text-sm text-rf-text-secondary leading-relaxed -mt-1 mb-2">
          {form.description}
        </p>
      )}

      {error && (
        <div className="bg-rf-danger-bg border border-red-200 rounded-lg px-4 py-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {fields.filter((field) => !field.settings?.hidden).map((field) => (
        <div key={field.field_id} className="space-y-1.5">
          <label
            htmlFor={field.key}
            className="block text-sm font-medium text-rf-ink-700"
          >
            {field.label}
            {field.required && (
              <span className="text-red-400 ml-1" aria-hidden="true">*</span>
            )}
          </label>

          {/* Optional description */}
          {field.settings?.description && (
            <p className="text-xs text-rf-text-secondary">{field.settings.description}</p>
          )}

          {/* Optional question image */}
          {field.settings?.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={field.settings.imageUrl}
              alt=""
              className="w-full rounded-lg object-contain max-h-60 border border-rf-border bg-rf-surface-page"
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
              placeholder={field.settings?.placeholder || "(555) 123-4567"}
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
                accept={field.settings?.accept || ".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"}
                className="w-full text-sm text-rf-ink-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-rf-ink-100 file:text-rf-ink-700 hover:file:bg-rf-ink-100 file:transition-colors cursor-pointer"
              />
              <p className="text-xs text-rf-text-muted">
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
                className="h-4 w-4 rounded border-rf-ink-100 text-rf-blue focus:ring-rf-blue/30"
              />
              <span className="text-sm text-rf-ink-500">{field.label}</span>
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
                    className="h-4 w-4 border-rf-ink-100 text-rf-blue focus:ring-rf-blue/30"
                  />
                  <label
                    htmlFor={`${field.key}-${idx}`}
                    className="text-sm text-rf-ink-700"
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
                <svg className="h-4 w-4 text-rf-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      <div className="pt-2 space-y-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-6 bg-rf-blue text-white text-sm font-medium rounded-lg hover:bg-rf-blue-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting && (
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {isSubmitting ? (uploadStatus ?? "Submitting…") : "Submit Application"}
        </button>

        {isSubmitting && uploadStatus && (
          <p className="text-xs text-rf-text-muted text-center">{uploadStatus}</p>
        )}

        <p className="text-xs text-rf-text-muted text-center">
          By submitting this form, you agree to the processing of your personal
          data in accordance with our privacy policy.
        </p>
      </div>

    </form>
  );
}
