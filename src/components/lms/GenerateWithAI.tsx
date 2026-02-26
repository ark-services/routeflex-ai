"use client";

import { useRef, useState, useCallback } from "react";
import { Sparkles, Upload, X, Loader2, ImageIcon, CheckCircle } from "lucide-react";

interface Props {
  moduleTitle: string;
  onGenerated: (content: string) => void;
}

export function GenerateWithAI({ moduleTitle, onGenerated }: Props) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<Array<{ dataUrl: string; name: string }>>([]);
  const [dragging, setDragging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setImages([]);
    setError(null);
    setSuccess(false);
    setGenerating(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Compress image to max 1280px on the longest side, JPEG quality 0.85.
  // Turns a ~2.5MB slide PNG into ~150KB — 20 slides stay well under 4MB total.
  async function compressImage(dataUrl: string, maxDim = 1280, quality = 0.85): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = dataUrl;
    });
  }

  async function addFiles(files: FileList | File[]) {
    const fileArr = Array.from(files);
    const imageFiles = fileArr.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const remaining = 20 - images.length;
    const toProcess = imageFiles.slice(0, remaining);

    const loaded = await Promise.all(
      toProcess.map(async (file) => ({
        dataUrl: await compressImage(await readFileAsDataUrl(file)),
        name: file.name,
      }))
    );

    setImages((prev) => [...prev, ...loaded]);
    setError(null);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      await addFiles(e.dataTransfer.files);
    },
    [images] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleGenerate() {
    if (images.length === 0) {
      setError("Upload at least one slide image.");
      return;
    }
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/lms/generate-module-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: moduleTitle,
          images: images.map((i) => i.dataUrl),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      onGenerated(data.content as string);
      setSuccess(true);
      setTimeout(() => {
        close();
      }, 1200);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Generate with AI
      </button>

      {/* Inline panel */}
      {open && (
        <div className="mt-3 border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-stone-800">
                Generate from slides
              </span>
            </div>
            <button
              type="button"
              onClick={close}
              className="p-1 text-stone-400 hover:text-stone-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-stone-500">
            Upload screenshots of your PowerPoint slides or PDF pages. Claude will
            read them and write a structured learning module.
          </p>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
              dragging
                ? "border-purple-400 bg-purple-50"
                : "border-stone-300 hover:border-purple-300 hover:bg-purple-50/50"
            }`}
          >
            <Upload className="w-5 h-5 mx-auto mb-2 text-stone-400" />
            <p className="text-xs text-stone-500">
              Drag &amp; drop slide images here, or{" "}
              <span className="text-purple-600 font-medium">click to browse</span>
            </p>
            <p className="text-xs text-stone-400 mt-1">PNG, JPG, WebP · max 20 slides · 5 MB each</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>

          {/* Thumbnail grid */}
          {images.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative group aspect-video rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                  <div className="absolute bottom-0.5 left-0.5 text-xs text-white bg-black/50 rounded px-1 leading-4">
                    {i + 1}
                  </div>
                </div>
              ))}
              {images.length < 20 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-video rounded-lg border-2 border-dashed border-stone-300 hover:border-purple-300 flex items-center justify-center text-stone-400 hover:text-purple-500 transition-colors"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              Content generated — review it below and click Save Content.
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || images.length === 0 || success}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analyzing slides…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Content
                </>
              )}
            </button>
            <button
              type="button"
              onClick={close}
              className="text-xs text-stone-500 hover:text-stone-700 transition-colors"
            >
              Cancel
            </button>
            {images.length > 0 && (
              <span className="ml-auto text-xs text-stone-400">
                {images.length} / 20 slides
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
