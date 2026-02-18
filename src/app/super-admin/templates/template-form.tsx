"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, XCircle, Info } from "lucide-react";
import { createTemplate, updateTemplate, uploadThumbnail } from "./actions";
import type { Template } from "@/lib/types";

interface Props {
  template?: Template;
}

export function TemplateForm({ template }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [existingThumbUrl, setExistingThumbUrl] = useState<string | null>(null);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch signed URL for existing thumbnail
  useEffect(() => {
    if (!template?.thumbnail_path) return;
    fetch(`/api/templates/signed-url?path=${encodeURIComponent(template.thumbnail_path)}`)
      .then((r) => r.json())
      .then((d) => { if (d.url) setExistingThumbUrl(d.url); })
      .catch(() => {});
  }, [template?.thumbnail_path]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        if (template) {
          const result = await updateTemplate(template.id, formData);
          if (result?.error) {
            showToast(result.error, "error");
          } else {
            showToast("Template saved.", "success");
          }
        } else {
          // createTemplate does a server-side redirect on success
          await createTemplate(formData);
        }
      } catch (err) {
        // redirect throws — that's expected on create
        const msg = (err as Error).message;
        if (!msg.includes("NEXT_REDIRECT")) {
          showToast(msg, "error");
        }
      }
    });
  };

  const handleThumbnailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !template) return;

    setThumbnailPreview(URL.createObjectURL(file));
    setUploadingThumb(true);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const result = await uploadThumbnail(template.id, fd);
      if (result.error) {
        showToast(result.error, "error");
      } else {
        showToast("Thumbnail uploaded.", "success");
        if (result.path) {
          fetch(`/api/templates/signed-url?path=${encodeURIComponent(result.path)}`)
            .then((r) => r.json())
            .then((d) => { if (d.url) setExistingThumbUrl(d.url); })
            .catch(() => {});
        }
      }
    } finally {
      setUploadingThumb(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            toast.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          name="title"
          defaultValue={template?.title ?? ""}
          required
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. FedEx Package Handler Hiring"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Description
        </label>
        <textarea
          name="description"
          defaultValue={template?.description ?? ""}
          rows={3}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Brief description shown to users in Template Center"
        />
      </div>

      {/* Published */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-stone-700">Published</label>
        <select
          name="is_published"
          defaultValue={template?.is_published !== false ? "true" : "false"}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="true">Yes — visible in Template Center</option>
          <option value="false">No — draft, hidden from users</option>
        </select>
      </div>

      {/* Thumbnail */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Thumbnail
        </label>
        {!template ? (
          <p className="text-xs text-stone-500">
            Save the template first, then upload a thumbnail.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="w-full h-36 rounded-lg border border-stone-200 overflow-hidden bg-stone-100">
              {thumbnailPreview || existingThumbUrl ? (
                <img
                  src={thumbnailPreview || existingThumbUrl!}
                  alt="Thumbnail preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xs text-stone-400">No thumbnail</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingThumb}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50"
            >
              {uploadingThumb ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploadingThumb ? "Uploading…" : "Upload image"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleThumbnailChange}
            />
          </div>
        )}
      </div>

      {/* Payload info callout — shown only after template exists */}
      {template && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            The template layout (groups, columns, automations) is captured from a real job board.
            Open any job's <strong>Applicants Board</strong> and use the{" "}
            <strong>Save as Template…</strong> button in the toolbar to update this template's layout.
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : template ? "Save changes" : "Create template"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/super-admin/templates")}
          className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
