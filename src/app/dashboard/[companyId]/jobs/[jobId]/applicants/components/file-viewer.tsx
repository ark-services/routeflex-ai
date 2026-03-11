"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { StoredFile } from "./types";

// ─── MIME helpers ────────────────────────────────────────────────────────────

const EXT_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
};

/** Returns the effective MIME type — falls back to extension sniffing if stored type is absent/generic. */
function effectiveType(file: StoredFile): string {
  const t = file.type ?? "";
  if (t && t !== "application/octet-stream" && t !== "binary/octet-stream") return t;
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  return EXT_MAP[ext] ?? t;
}

function isImageType(type: string) {
  return type.startsWith("image/");
}
function isPDFType(type: string) {
  return type === "application/pdf";
}

// ─── FileSvgIcon ─────────────────────────────────────────────────────────────

export function FileSvgIcon({ type }: { type: string }) {
  const effective = type && type !== "application/octet-stream" ? type : "";
  if (isPDFType(effective))
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-danger" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    );
  if (effective.includes("word") || effective.includes("msword"))
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-blue" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    );
  if (effective.includes("sheet") || effective.includes("excel") || effective === "text/csv")
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-success" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd" />
      </svg>
    );
  if (isImageType(effective))
    return (
      <svg className="h-4 w-4 flex-shrink-0 text-rf-blue" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
      </svg>
    );
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-rf-text-muted" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  );
}

// ─── FileViewer ───────────────────────────────────────────────────────────────

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
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [animating, setAnimating] = useState(false);

  const current = files[index];
  const type = current ? effectiveType(current) : "";
  const isImage = isImageType(type);
  const isPDF = isPDFType(type);

  // ── Signed URL fetching ──────────────────────────────────────────────────

  const fetchSignedUrl = useCallback(async (file: StoredFile) => {
    if (signedUrls[file.id] !== undefined) return;
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
  }, [signedUrls]);

  useEffect(() => {
    if (!current) return;
    setZoom(1);
    fetchSignedUrl(current);
    if (files[index + 1]) fetchSignedUrl(files[index + 1]);
    if (files[index - 1]) fetchSignedUrl(files[index - 1]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, files.length]);

  // ── Navigation with slide animation ─────────────────────────────────────

  function navigate(dir: "prev" | "next") {
    if (animating) return;
    const nextIdx = dir === "prev" ? index - 1 : index + 1;
    if (nextIdx < 0 || nextIdx >= files.length) return;
    setSlideDir(dir === "prev" ? "right" : "left");
    setAnimating(true);
    setTimeout(() => {
      setIndex(nextIdx);
      setSlideDir(null);
      setAnimating(false);
    }, 220);
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") navigate("next");
      if (e.key === "ArrowLeft") navigate("prev");
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.25));
      if (e.key === "-") setZoom((z) => Math.max(0.25, z - 0.25));
      if (e.key === "0") setZoom(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, files.length, onClose, animating]);

  const url = current ? signedUrls[current.id] : undefined;

  // ── Slide animation classes ──────────────────────────────────────────────

  const slideClass = slideDir === "left"
    ? "animate-slide-out-left"
    : slideDir === "right"
    ? "animate-slide-out-right"
    : "";

  // ── Format helpers ───────────────────────────────────────────────────────

  function formatBytes(bytes: number): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  }

  function fileTypeBadge(t: string): string {
    if (isPDFType(t)) return "PDF";
    if (isImageType(t)) return t.split("/")[1]?.toUpperCase() ?? "IMG";
    if (t.includes("word")) return "DOC";
    if (t.includes("sheet") || t.includes("excel")) return "XLS";
    if (t === "text/csv") return "CSV";
    const ext = (current?.name.split(".").pop() ?? "").toUpperCase();
    return ext || "FILE";
  }

  return createPortal(
    <>
      <style>{`
        @keyframes viewer-in {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to   { opacity: 1; backdrop-filter: blur(8px); }
        }
        @keyframes panel-in {
          from { opacity: 0; transform: scale(0.97) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes slide-out-left {
          to { opacity: 0; transform: translateX(-40px); }
        }
        @keyframes slide-out-right {
          to { opacity: 0; transform: translateX(40px); }
        }
        .fv-overlay { animation: viewer-in 200ms ease both; }
        .fv-panel   { animation: panel-in 220ms cubic-bezier(0.16,1,0.3,1) both; }
        .animate-slide-out-left  { animation: slide-out-left  220ms ease forwards; }
        .animate-slide-out-right { animation: slide-out-right 220ms ease forwards; }
        .fv-thumb::-webkit-scrollbar { height: 4px; }
        .fv-thumb::-webkit-scrollbar-track { background: transparent; }
        .fv-thumb::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 99px; }
      `}</style>

      {/* Backdrop */}
      <div
        className="fv-overlay fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(8, 8, 12, 0.92)" }}
        onClick={onClose}
      >
        {/* Panel */}
        <div
          className="fv-panel relative flex h-[92vh] w-[92vw] max-w-5xl flex-col overflow-hidden rounded-2xl"
          style={{
            background: "linear-gradient(160deg, #16161e 0%, #111118 100%)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div
            className="flex flex-shrink-0 items-center gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            {/* File info */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                {current && <FileSvgIcon type={type} />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight text-white/90">
                  {current?.name ?? "File"}
                </p>
                <p className="flex items-center gap-2 text-[11px] leading-tight text-white/35 mt-0.5">
                  {current?.size ? formatBytes(current.size) : null}
                  {current?.size && current?.createdAt ? <span>·</span> : null}
                  {current?.createdAt ? formatDate(current.createdAt) : null}
                </p>
              </div>

              {/* Type badge */}
              <span
                className="ml-1 flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider"
                style={{
                  background: isPDF ? "rgba(239,68,68,0.15)" : isImage ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.07)",
                  color: isPDF ? "#f87171" : isImage ? "#60a5fa" : "rgba(255,255,255,0.45)",
                }}
              >
                {fileTypeBadge(type)}
              </span>

              {/* File count */}
              {files.length > 1 && (
                <span className="flex-shrink-0 text-xs text-white/30">
                  {index + 1} / {files.length}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {/* Zoom controls (images only) */}
              {isImage && (
                <>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white/90"
                    title="Zoom out (−)"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                    </svg>
                  </button>
                  {zoom !== 1 && (
                    <button
                      type="button"
                      onClick={() => setZoom(1)}
                      className="rounded-lg px-1.5 py-1 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/8 hover:text-white/80"
                    >
                      {Math.round(zoom * 100)}%
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white/90"
                    title="Zoom in (+)"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </button>
                  <div className="mx-1.5 h-4 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                </>
              )}

              {/* Download */}
              {url && (
                <a
                  href={url}
                  download={current?.name}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white/90"
                  title="Download"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              )}

              {/* Delete */}
              {current && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(current.id);
                    if (files.length === 1) onClose();
                    else setIndex((i) => Math.min(i, files.length - 2));
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-red-500/20 hover:text-red-400"
                  title="Delete file"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}

              <div className="mx-1.5 h-4 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/8 hover:text-white/90"
                aria-label="Close (Esc)"
                title="Close (Esc)"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Main content ─────────────────────────────────────────────────── */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">

            {/* Prev arrow */}
            {index > 0 && (
              <button
                type="button"
                onClick={() => navigate("prev")}
                className="absolute left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-all hover:text-white/90"
                style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
                aria-label="Previous file"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Content */}
            <div className={`flex h-full w-full items-center justify-center p-6 ${slideClass}`}>
              {loadingUrl && url === undefined ? (
                /* Loading spinner */
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="h-8 w-8 animate-spin rounded-full"
                    style={{ border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.6)" }}
                  />
                  <p className="text-xs text-white/30">Loading…</p>
                </div>
              ) : url === null ? (
                /* Error state */
                <div className="flex flex-col items-center gap-4 text-white/40">
                  <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">Unable to load preview</p>
                </div>
              ) : isImage ? (
                /* Image viewer */
                <div
                  className="overflow-auto rounded-lg"
                  style={{ maxHeight: "100%", maxWidth: "100%", cursor: zoom > 1 ? "move" : "default" }}
                >
                  <img
                    src={url}
                    alt={current?.name}
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "center",
                      transition: "transform 0.15s cubic-bezier(0.16,1,0.3,1)",
                      display: "block",
                      maxHeight: "calc(92vh - 140px)",
                      maxWidth: "100%",
                      objectFit: "contain",
                      borderRadius: "8px",
                      boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
                    }}
                    onError={(e) => {
                      // If img fails to load with signed URL, show fallback
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              ) : isPDF ? (
                /* PDF viewer */
                <iframe
                  src={url}
                  className="rounded-lg"
                  style={{
                    height: "calc(92vh - 120px)",
                    width: "100%",
                    maxWidth: "860px",
                    border: "none",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
                  }}
                  title={current?.name}
                />
              ) : (
                /* Unsupported type */
                <div className="flex flex-col items-center gap-5">
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    {current && <FileSvgIcon type={type} />}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white/70">{current?.name}</p>
                    <p className="mt-1 text-xs text-white/35">Preview not available for this file type</p>
                  </div>
                  {url && (
                    <a
                      href={url}
                      download={current?.name}
                      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.8)",
                      }}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download {current?.name}
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Next arrow */}
            {index < files.length - 1 && (
              <button
                type="button"
                onClick={() => navigate("next")}
                className="absolute right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-all hover:text-white/90"
                style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
                aria-label="Next file"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          {/* ── Thumbnail strip (multi-file) ──────────────────────────────────── */}
          {files.length > 1 && (
            <div
              className="fv-thumb flex flex-shrink-0 items-center gap-2 overflow-x-auto px-4 py-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
            >
              {files.map((f, i) => {
                const fType = effectiveType(f);
                const fIsImage = isImageType(fType);
                const thumbUrl = signedUrls[f.id];
                const isActive = i === index;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (i === index) return;
                      setSlideDir(i > index ? "left" : "right");
                      setAnimating(true);
                      setTimeout(() => {
                        setIndex(i);
                        setSlideDir(null);
                        setAnimating(false);
                      }, 220);
                    }}
                    className="group relative flex-shrink-0 overflow-hidden rounded-lg transition-all"
                    style={{
                      width: 48,
                      height: 48,
                      outline: isActive ? "2px solid rgba(255,255,255,0.6)" : "2px solid transparent",
                      outlineOffset: 2,
                      background: "rgba(255,255,255,0.05)",
                      opacity: isActive ? 1 : 0.5,
                    }}
                    title={f.name}
                  >
                    {fIsImage && thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={f.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <FileSvgIcon type={fType} />
                      </div>
                    )}
                    {/* Active indicator */}
                    {isActive && (
                      <div
                        className="absolute inset-0 rounded-lg"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
