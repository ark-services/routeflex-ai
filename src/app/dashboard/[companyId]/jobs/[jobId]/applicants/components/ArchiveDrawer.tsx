"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, ArchiveRestore, Archive, Search } from "lucide-react";
import { getArchivedApplicants, restoreApplicants } from "../actions";
import { useToast } from "@/components/ui/toast-provider";

type ArchivedApplicant = {
  id: string;
  full_name: string;
  email: string | null;
  group_id: string | null;
  archived_at: string;
  archived_by: string | null;
  archived_by_name: string;
};

export function ArchiveDrawer({
  open,
  onClose,
  companyId,
  jobId,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  jobId: string;
}) {
  const [applicants, setApplicants] = useState<ArchivedApplicant[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getArchivedApplicants(companyId, jobId)
      .then((data) => setApplicants(data as ArchivedApplicant[]))
      .catch(() => toast.error("Failed to load archived applicants"))
      .finally(() => setLoading(false));
  }, [open, companyId, jobId]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const filtered = search
    ? applicants.filter(
        (a) =>
          a.full_name.toLowerCase().includes(search.toLowerCase()) ||
          (a.email && a.email.toLowerCase().includes(search.toLowerCase()))
      )
    : applicants;

  function toggleRow(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAll() {
    const allSelected = filtered.every((a) => selected[a.id]);
    const next: Record<string, boolean> = {};
    filtered.forEach((a) => (next[a.id] = !allSelected));
    setSelected(next);
  }

  function handleRestore(ids: string[]) {
    startTransition(async () => {
      try {
        await restoreApplicants(companyId, jobId, ids);
        setApplicants((prev) => prev.filter((a) => !ids.includes(a.id)));
        setSelected({});
        toast.success(`Restored ${ids.length} applicant${ids.length !== 1 ? "s" : ""}`);
      } catch {
        toast.error("Failed to restore applicants");
      }
    });
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    return d.toLocaleDateString();
  }

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[900] transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-rf-surface-card z-[901] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rf-border">
          <div className="flex items-center gap-3">
            <Archive className="w-5 h-5 text-rf-text-muted" />
            <h2 className="text-lg font-semibold text-rf-ink-900">Archive</h2>
            {applicants.length > 0 && (
              <span className="text-sm text-rf-text-secondary">
                ({applicants.length})
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-rf-text-muted hover:bg-rf-surface-page transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-rf-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rf-text-muted" />
            <input
              type="text"
              placeholder="Search archived applicants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-rf-border bg-rf-surface-page text-sm outline-none focus:border-rf-brand-primary transition-colors"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-rf-text-secondary">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Archive className="w-12 h-12 text-rf-ink-100" />
              <p className="text-sm text-rf-text-secondary">
                {search
                  ? "No archived applicants match your search"
                  : "No archived applicants"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-rf-border text-left text-xs text-rf-text-secondary uppercase tracking-wider">
                  <th className="pl-6 pr-2 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 &&
                        filtered.every((a) => selected[a.id])
                      }
                      onChange={toggleAll}
                      className="rounded border-rf-ink-200"
                    />
                  </th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Archived by</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 pr-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-rf-ink-50 hover:bg-rf-surface-page transition-colors"
                  >
                    <td className="pl-6 pr-2 py-3">
                      <input
                        type="checkbox"
                        checked={!!selected[a.id]}
                        onChange={() => toggleRow(a.id)}
                        className="rounded border-rf-ink-200"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm font-medium text-rf-ink-900">
                        {a.full_name}
                      </div>
                      {a.email && (
                        <div className="text-xs text-rf-text-secondary">
                          {a.email}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-rf-ink-700">
                      {a.archived_by_name}
                    </td>
                    <td className="px-3 py-3 text-sm text-rf-text-secondary">
                      {formatDate(a.archived_at)}
                    </td>
                    <td className="px-3 py-3 pr-6 text-right">
                      <button
                        onClick={() => handleRestore([a.id])}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rf-brand-primary hover:bg-rf-brand-primary/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Bulk restore bar */}
        {selectedIds.length > 0 && (
          <div className="border-t border-rf-border px-6 py-3 bg-rf-surface-card flex items-center justify-between">
            <span className="text-sm text-rf-ink-700">
              <span className="font-semibold">{selectedIds.length}</span>{" "}
              selected
            </span>
            <button
              onClick={() => handleRestore(selectedIds)}
              disabled={isPending}
              className="h-9 rounded-lg bg-rf-brand-primary px-4 text-sm font-medium text-white hover:bg-rf-brand-primary/90 disabled:opacity-60 flex items-center gap-2"
            >
              <ArchiveRestore className="w-4 h-4" />
              Restore
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
