"use client";

import { useEffect, useState, useRef } from "react";
import type { ApplicantRow, BoardColumn, StoredFile } from "./types";
import { FileSvgIcon, FileViewer } from "./file-viewer";

export function FileCell({
  applicant,
  column,
  value,
  companyId,
  boardId,
  onUpdate,
}: {
  applicant: ApplicantRow;
  column: BoardColumn;
  value: StoredFile[] | null;
  companyId: string;
  boardId: string;
  onUpdate: (val: any) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<StoredFile[]>(value ?? []);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync from server when parent propagates a change
  useEffect(() => {
    setLocalFiles(value ?? []);
  }, [value]);

  // -- Upload --

  async function handleFileSelect(file: File) {
    setUploading(true);
    setUploadError(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("companyId", companyId);
    fd.append("boardId", boardId);
    fd.append("columnId", column.id);
    fd.append("applicantId", applicant.id);

    try {
      const res = await fetch("/api/board/upload-file", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Upload failed");

      const newFile: StoredFile = {
        id: crypto.randomUUID(),
        name: data.metadata?.name ?? file.name,
        path: data.path,
        bucket: "files",
        type: data.metadata?.type ?? file.type,
        size: data.metadata?.size ?? file.size,
        createdAt: new Date().toISOString(),
      };

      const next = [...localFiles, newFile];
      setLocalFiles(next);
      onUpdate(next);
      setUploadError(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
      e.target.value = ""; // reset so same file can be re-selected
    }
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  // -- Delete (from FileViewer) --

  function handleDelete(fileId: string) {
    const next = localFiles.filter((f) => f.id !== fileId);
    setLocalFiles(next);
    onUpdate(next.length > 0 ? next : []);
  }

  // -- Drag-and-drop --

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  // -- Paste --

  function handlePaste(e: React.ClipboardEvent) {
    const fileItem = Array.from(e.clipboardData.items).find((i) => i.kind === "file");
    if (!fileItem) return;
    e.preventDefault();
    const file = fileItem.getAsFile();
    if (file) handleFileSelect(file);
  }

  // Hidden file input -- always in DOM
  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      className="sr-only"
      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.txt,.json,.html"
      onChange={handleInputChange}
      tabIndex={-1}
      aria-hidden="true"
    />
  );

  const firstFile = localFiles[0];
  const extraCount = localFiles.length - 1;

  // -- Uploading --

  if (uploading) {
    return (
      <div className="flex h-8 w-full items-center gap-2 px-1">
        {hiddenInput}
        <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-rf-border border-t-blue-500" />
        <span className="truncate text-xs text-rf-text-secondary">Uploading...</span>
      </div>
    );
  }

  // -- Empty state --

  if (localFiles.length === 0) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload file"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={`group/fcell relative flex h-8 w-full cursor-pointer items-center rounded px-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue ${
          isDragOver ? "bg-rf-blue-tint ring-1 ring-inset ring-blue-300" : "hover:bg-rf-surface-page"
        }`}
      >
        {hiddenInput}
        <svg
          className={`h-4 w-4 text-rf-text-muted transition-opacity ${
            isDragOver ? "opacity-100" : "opacity-0 group-hover/fcell:opacity-100 group-focus/fcell:opacity-100"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        {uploadError && (
          <span className="ml-1 truncate text-xs text-rf-danger" title={uploadError}>{uploadError}</span>
        )}
      </div>
    );
  }

  // -- Filled state --

  return (
    <div
      className={`group/fcell relative flex h-8 w-full items-center gap-1 rounded px-1 transition-colors ${
        isDragOver ? "bg-rf-blue-tint ring-1 ring-inset ring-blue-300" : "hover:bg-rf-surface-page"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {hiddenInput}

      {/* First file icon + name -- clicking opens viewer at index 0 */}
      <button
        type="button"
        onClick={() => { setViewerIndex(0); setViewerOpen(true); }}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={firstFile.name}
      >
        <FileSvgIcon type={firstFile.type} />
        <span className="truncate text-xs text-rf-ink-700">{firstFile.name}</span>
        {extraCount > 0 && (
          <span className="ml-0.5 flex-shrink-0 rounded bg-rf-ink-100 px-1 py-0.5 text-[10px] font-medium leading-none text-rf-ink-500">
            +{extraCount}
          </span>
        )}
      </button>

      {/* Hover actions */}
      <div className="flex flex-shrink-0 items-center opacity-0 transition-opacity group-hover/fcell:opacity-100">
        {/* Add more */}
        <button
          type="button"
          onClick={openPicker}
          className="rounded p-0.5 text-rf-text-muted transition-colors hover:bg-rf-ink-100 hover:text-rf-ink-700"
          title="Add file"
          aria-label="Add file"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {uploadError && (
        <span className="ml-1 flex-shrink-0 text-xs text-rf-danger" title={uploadError}>!</span>
      )}

      {/* File viewer */}
      {viewerOpen && (
        <FileViewer
          files={localFiles}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
