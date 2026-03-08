"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { StoredFile } from "./types";

// Tiny inline SVG icons -- one per file-type family.
export function FileSvgIcon({ type }: { type: string }) {
  // PDF
  if (type === "application/pdf")
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-danger" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    );
  // Word / DOC / DOCX
  if (type.includes("word") || type.includes("msword"))
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-blue" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    );
  // Excel / CSV / Sheets
  if (type.includes("sheet") || type.includes("excel") || type === "text/csv")
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-success" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd" />
      </svg>
    );
  // Images
  if (type.startsWith("image/"))
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-blue" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    );
  // Generic
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-rf-text-muted" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  );
}

// ===== FileViewer =====
// Full-screen carousel viewer for one or more StoredFile items.
// Fetches short-lived signed URLs on demand, caches them in a ref.

export function FileViewer({
  files,
  initialIndex,
  onClose,
  onDelete,
}: {
  files: StoredFile[];
  initialIndex: number;
  onClose: () => void;
  onDelete: (fileId: string) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({});
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [zoom, setZoom] = useState(1);

  const current = files[index];

  // Fetch a signed URL for a given file path (cached in state)
  async function fetchSignedUrl(file: StoredFile) {
    if (signedUrls[file.id] !== undefined) return; // already fetched or failed
    setLoadingUrl(true);
    try {
      const params = new URLSearchParams({ path: file.path, bucket: file.bucket || "files" });
      const res = await fetch(`/api/board/signed-url?${params}`);
      const data = await res.json();
      setSignedUrls((prev) => ({ ...prev, [file.id]: res.ok ? data.url : null }));
    } catch {
      setSignedUrls((prev) => ({ ...prev, [file.id]: null }));
    } finally {
      setLoadingUrl(false);
    }
  }

  // Fetch URL whenever current file changes; prefetch adjacent files
  useEffect(() => {
    if (!current) return;
    setZoom(1); // reset zoom on file change
    fetchSignedUrl(current);
    if (files[index + 1]) fetchSignedUrl(files[index + 1]);
    if (files[index - 1]) fetchSignedUrl(files[index - 1]);
  }, [index, files.length]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < files.length - 1) setIndex((i) => i + 1);
      if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, files.length, onClose]);

  const url = current ? signedUrls[current.id] : undefined;
  const isImage = current?.type.startsWith("image/") ?? false;
  const isPDF = current?.type === "application/pdf";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between border-b border-white/10 bg-black/60 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* File name + count */}
        <div className="flex min-w-0 items-center gap-2">
          {current && <FileSvgIcon type={current.type} />}
          <span className="truncate text-sm font-medium text-white">{current?.name ?? "File"}</span>
          {files.length > 1 && (
            <span className="ml-1 flex-shrink-0 rounded bg-rf-surface-card/10 px-1.5 py-0.5 text-xs text-white/60">
              {index + 1} / {files.length}
            </span>
          )}
        </div>

        {/* Action bar */}
        <div className="ml-4 flex flex-shrink-0 items-center gap-1">
          {/* Zoom (images only) */}
          {isImage && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
                title="Zoom out"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
                title="Zoom in"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </button>
              {zoom !== 1 && (
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="rounded px-2 py-1 text-xs text-white/60 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
              )}
              <div className="mx-1 h-4 w-px bg-rf-surface-card/20" />
            </>
          )}
          {/* Print */}
          {url && (
            <button
              type="button"
              onClick={() => {
                const win = window.open(url, "_blank");
                win?.print();
              }}
              className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
              title="Print"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </button>
          )}
          {/* Download */}
          {url && (
            <a
              href={url}
              download={current?.name}
              className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
              title="Download"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
          )}
          {/* Delete */}
          {current && (
            <button
              type="button"
              onClick={() => {
                onDelete(current.id);
                // If last file, close viewer; else advance index
                if (files.length === 1) {
                  onClose();
                } else {
                  setIndex((i) => Math.min(i, files.length - 2));
                }
              }}
              className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-danger/80 hover:text-white"
              title="Delete file"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <div className="mx-1 h-4 w-px bg-rf-surface-card/20" />
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-white/70 transition-colors hover:bg-rf-surface-card/10 hover:text-white"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prev arrow */}
        {index > 0 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            className="absolute left-3 z-10 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
            aria-label="Previous file"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* File preview */}
        <div className="flex h-full w-full items-center justify-center p-4">
          {loadingUrl && !url ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          ) : url === null ? (
            <div className="flex flex-col items-center gap-4 text-white/60">
              <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">Unable to load file preview</p>
            </div>
          ) : isImage ? (
            <img
              src={url}
              alt={current?.name}
              style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.15s" }}
              className="max-h-[80vh] max-w-full object-contain"
            />
          ) : isPDF ? (
            <iframe src={url} className="h-[80vh] w-full max-w-4xl rounded" title={current?.name} />
          ) : (
            <div className="flex flex-col items-center gap-4">
              {current && <FileSvgIcon type={current.type} />}
              <p className="text-sm text-white/60">Preview not available for this file type.</p>
              <a
                href={url}
                download={current?.name}
                className="rounded-lg bg-rf-surface-card px-4 py-2 text-sm font-medium text-rf-text-primary transition-colors hover:bg-rf-surface-page"
              >
                Download {current?.name}
              </a>
            </div>
          )}
        </div>

        {/* Next arrow */}
        {index < files.length - 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className="absolute right-3 z-10 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
            aria-label="Next file"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Film strip dots (if multiple files) */}
      {files.length > 1 && (
        <div
          className="flex flex-shrink-0 items-center justify-center gap-1.5 border-t border-white/10 bg-black/60 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-5 bg-rf-surface-card" : "w-2 bg-rf-surface-card/30 hover:bg-rf-surface-card/60"
              }`}
              aria-label={`Go to file ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
