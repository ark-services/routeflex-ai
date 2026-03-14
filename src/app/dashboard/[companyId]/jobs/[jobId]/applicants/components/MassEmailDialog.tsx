"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Mail,
  Plus,
  Users,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VariableItem { label: string; token: string }
interface VariableGroup { section: string; items: VariableItem[] }

type BoardColumn = { id: string; name: string; type: string };
type Recipient   = { id: string; full_name: string; email: string };

export interface MassEmailDialogProps {
  open: boolean;
  onClose: () => void;
  recipients: Recipient[];
  companyId: string;
  jobId: string;
  columns: BoardColumn[];
  onSend: (subject: string, body: string) => Promise<{ sent: number; failed: number; noEmail: number }>;
}

type SendState = "idle" | "sending" | "done";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugifyColName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// ─── VariablePickerButton ─────────────────────────────────────────────────────
// Renders the dropdown via a document.body portal with fixed positioning so it
// escapes overflow:hidden/auto ancestors (dialog container, scrollable form).

function VariablePickerButton({
  groups,
  fieldRef,
  value,
  onChange,
}: {
  groups: VariableGroup[];
  fieldRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  function openDropdown() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(true);
  }

  // Close on outside click — the transparent backdrop handles this
  function handleInsert(token: string) {
    const el = fieldRef.current;
    const start = el?.selectionStart ?? value.length;
    const end   = el?.selectionEnd   ?? value.length;
    const newValue = value.slice(0, start) + token + value.slice(end);
    onChange(newValue);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      }
    });
    setOpen(false);
  }

  const dropdown = open ? createPortal(
    <>
      {/* Transparent backdrop — closes dropdown on outside click */}
      <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
      <div
        style={{ top: pos.top, right: pos.right }}
        className="fixed z-[71] w-64 bg-rf-surface-card border border-rf-border rounded-lg shadow-xl py-1 max-h-72 overflow-y-auto"
      >
        {groups.map((group) => (
          <div key={group.section}>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-rf-ink-700 uppercase tracking-widest bg-rf-surface-page sticky top-0 border-b border-rf-border">
              {group.section}
            </div>
            {group.items.map((v) => (
              <button
                key={v.token}
                type="button"
                onClick={() => handleInsert(v.token)}
                className="w-full text-left px-3 py-2 hover:bg-rf-surface-page transition-colors border-b border-rf-border last:border-0"
              >
                  <span className="text-sm text-rf-text-primary block">{v.label}</span>
                  <span className="text-[11px] text-rf-ink-700 font-mono block mt-0.5">{v.token}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </>,
      document.body
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className="flex items-center gap-1 text-xs text-rf-blue hover:text-rf-blue/80 font-medium transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add variable
      </button>
      {dropdown}
    </>
  );
}

// ─── MassEmailDialog ──────────────────────────────────────────────────────────

export function MassEmailDialog({
  open,
  onClose,
  recipients,
  columns,
  onSend,
}: MassEmailDialogProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [result, setResult] = useState<{ sent: number; failed: number; noEmail: number } | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef    = useRef<HTMLTextAreaElement>(null);

  const withEmail   = recipients.filter((r) => r.email?.trim());
  const noEmailCount = recipients.length - withEmail.length;
  const canSend = subject.trim().length > 0 && body.trim().length > 0 && withEmail.length > 0;

  // Build variable groups from columns + standard applicant vars
  const variableGroups = useMemo<VariableGroup[]>(() => {
    const applicantGroup: VariableGroup = {
      section: "Applicant info",
      items: [
        { label: "Applicant name",  token: "{{applicant_name}}" },
        { label: "First name",      token: "{{first_name}}" },
        { label: "Email",           token: "{{applicant_email}}" },
        { label: "Job title",       token: "{{job_title}}" },
        { label: "Company name",    token: "{{company_name}}" },
      ],
    };

    const colItems = columns
      .filter((c) => c.type !== "file")
      .map((c) => ({ label: c.name, token: `{{${slugifyColName(c.name)}}}` }));

    const groups: VariableGroup[] = [applicantGroup];
    if (colItems.length > 0) {
      groups.push({ section: "Board columns", items: colItems });
    }
    return groups;
  }, [columns]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSubject("");
      setBody("");
      setRecipientsOpen(false);
      setSendState("idle");
      setResult(null);
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && sendState !== "sending") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, sendState]);

  async function handleSend() {
    if (!canSend) return;
    setSendState("sending");
    try {
      const res = await onSend(subject, body);
      setResult(res);
    } catch {
      setResult({ sent: 0, failed: withEmail.length, noEmail: noEmailCount });
    } finally {
      setSendState("done");
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && sendState !== "sending") onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-rf-surface-card rounded-xl shadow-2xl border border-rf-border flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rf-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-rf-blue/10 shrink-0">
              <Mail className="w-4 h-4 text-rf-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-rf-text-primary leading-tight">
                Mass email
              </h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-rf-ink-700">
                  {withEmail.length} recipient{withEmail.length !== 1 ? "s" : ""}
                </span>
                {noEmailCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5 text-[11px] font-medium">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {noEmailCount} no email
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={sendState === "sending"}
            className="ml-3 shrink-0 text-rf-ink-700 hover:text-rf-text-primary hover:bg-rf-surface-page rounded-lg p-1.5 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        {sendState === "done" && result ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center gap-4 py-12 px-8 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-200">
              <Check className="w-7 h-7 text-emerald-600" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-base font-semibold text-rf-text-primary">
                {result.sent > 0
                  ? `Sent to ${result.sent} applicant${result.sent !== 1 ? "s" : ""}`
                  : "No emails sent"}
              </p>
              {(result.failed > 0 || result.noEmail > 0) && (
                <p className="text-xs text-rf-ink-700 mt-2 flex items-center justify-center gap-2 flex-wrap">
                  {result.sent > 0 && (
                    <span className="text-emerald-600 font-medium">{result.sent} sent</span>
                  )}
                  {result.failed > 0 && (
                    <span className="text-rf-danger font-medium">· {result.failed} failed</span>
                  )}
                  {result.noEmail > 0 && (
                    <span className="text-amber-600 font-medium">· {result.noEmail} had no email</span>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="mt-2 border border-rf-border bg-rf-surface-card hover:bg-rf-surface-page rounded-lg px-5 py-2 text-sm font-medium text-rf-text-primary transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Compose form */
          <div className="divide-y divide-rf-border overflow-y-auto max-h-[70vh]">

            {/* To */}
            <div className="px-5 py-3">
              <div className="flex items-start gap-3">
                <span className="text-xs font-medium text-rf-ink-700 w-14 shrink-0 pt-2">To</span>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setRecipientsOpen((v) => !v)}
                    className="flex items-center gap-2 bg-rf-surface-page border border-rf-border hover:border-rf-blue/40 rounded-lg px-3 py-1.5 text-xs font-medium text-rf-text-primary transition-colors group"
                  >
                    <Users className="w-3.5 h-3.5 text-rf-ink-700 shrink-0" />
                    <span>{withEmail.length} recipient{withEmail.length !== 1 ? "s" : ""} from Email column</span>
                    {recipientsOpen
                      ? <ChevronUp className="w-3.5 h-3.5 text-rf-ink-700 ml-auto" />
                      : <ChevronDown className="w-3.5 h-3.5 text-rf-ink-700 ml-auto" />}
                  </button>

                  {recipientsOpen && (
                    <div className="mt-2 border border-rf-border rounded-lg overflow-y-auto max-h-48 bg-rf-surface-page divide-y divide-rf-border">
                      {recipients.map((r) => {
                        const hasEmail = !!r.email?.trim();
                        return (
                          <div
                            key={r.id}
                            className={`flex items-center justify-between gap-3 px-3 py-2 ${!hasEmail ? "opacity-50" : ""}`}
                          >
                            <span className="text-xs font-medium text-rf-text-primary truncate">{r.full_name}</span>
                            {hasEmail ? (
                              <span className="text-xs text-rf-ink-700 truncate shrink-0 max-w-[220px]">{r.email}</span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium shrink-0">
                                <AlertCircle className="w-3 h-3" /> No email
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Subject */}
            <div className="px-5 py-3">
              <div className="flex items-start gap-3">
                <span className="text-xs font-medium text-rf-ink-700 w-14 shrink-0 pt-2">Subject</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-rf-ink-700">{subject.length} characters</span>
                    <VariablePickerButton
                      groups={variableGroups}
                      fieldRef={subjectRef}
                      value={subject}
                      onChange={setSubject}
                    />
                  </div>
                  <input
                    ref={subjectRef}
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={sendState === "sending"}
                    placeholder="e.g. Your application for {{job_title}}"
                    className="border border-rf-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rf-blue/20 focus:border-rf-blue w-full bg-rf-surface-card disabled:opacity-60 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Message */}
            <div className="px-5 py-3">
              <div className="flex items-start gap-3">
                <span className="text-xs font-medium text-rf-ink-700 w-14 shrink-0 pt-2">Message</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-rf-ink-700">&nbsp;</span>
                    <VariablePickerButton
                      groups={variableGroups}
                      fieldRef={bodyRef}
                      value={body}
                      onChange={setBody}
                    />
                  </div>
                  <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={sendState === "sending"}
                    placeholder={"Hi {{first_name}},\n\nThank you for applying to {{job_title}}…"}
                    rows={8}
                    className="border border-rf-border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rf-blue/20 focus:border-rf-blue w-full bg-rf-surface-card resize-y min-h-[180px] disabled:opacity-60 font-mono leading-relaxed transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        {sendState !== "done" && (
          <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-rf-border bg-rf-surface-page">
            <p className="flex items-start gap-1.5 text-[11px] text-rf-ink-700 leading-relaxed max-w-xs">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Recipients get individual emails and won&apos;t see that it was sent to others.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onClose}
                disabled={sendState === "sending"}
                className="border border-rf-border bg-rf-surface-card hover:bg-rf-surface-page rounded-lg px-4 py-2 text-sm font-medium text-rf-text-primary transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend || sendState === "sending"}
                className="bg-rf-blue text-white hover:bg-rf-blue-dark rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendState === "sending" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                {sendState === "sending" ? "Sending…" : `Send to ${withEmail.length}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
