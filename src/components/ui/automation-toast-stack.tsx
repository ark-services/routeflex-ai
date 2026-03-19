"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Zap, X, CheckCircle2, XCircle } from "lucide-react";

// Custom DOM event names — emitted by the realtime subscriber in AppShell
export const AUTOMATION_RUNNING_EVENT = "automation:running";
export const AUTOMATION_COMPLETED_EVENT = "automation:completed";
export const AUTOMATION_FAILED_EVENT = "automation:failed";

export function emitAutomationRunning(name: string) {
  window.dispatchEvent(
    new CustomEvent(AUTOMATION_RUNNING_EVENT, { detail: { name } })
  );
}

export function emitAutomationCompleted(name: string) {
  window.dispatchEvent(
    new CustomEvent(AUTOMATION_COMPLETED_EVENT, { detail: { name } })
  );
}

export function emitAutomationFailed(name: string, error?: string | null) {
  window.dispatchEvent(
    new CustomEvent(AUTOMATION_FAILED_EVENT, { detail: { name, error } })
  );
}

type ToastVariant = "running" | "completed" | "failed";

interface ToastItem {
  id: string;
  variant: ToastVariant;
  label: string;      // short status label, e.g. "Automation running"
  name: string;       // automation name (full, wraps)
  count: number;      // >1 means batched
  error?: string | null;
}

const DISMISS_AFTER_MS = 4000;
// Events arriving within this window are collapsed into one toast
const BATCH_WINDOW_MS = 400;

export function AutomationToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const batchRef = useRef<{
    running: string[];
    completed: string[];
    failed: Array<{ name: string; error?: string | null }>;
    runningTimer: ReturnType<typeof setTimeout> | null;
    completedTimer: ReturnType<typeof setTimeout> | null;
    failedTimer: ReturnType<typeof setTimeout> | null;
  }>({
    running: [],
    completed: [],
    failed: [],
    runningTimer: null,
    completedTimer: null,
    failedTimer: null,
  });

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (variant: ToastVariant, label: string, name: string, count: number, error?: string | null) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-2), { id, variant, label, name, count, error }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss]
  );

  useEffect(() => {
    const b = batchRef.current;

    const flushRunning = () => {
      const names = b.running.splice(0);
      b.runningTimer = null;
      if (names.length === 1) {
        pushToast("running", "Automation running", names[0], 1);
      } else {
        pushToast("running", `${names.length} automations running`, "", names.length);
      }
    };

    const flushCompleted = () => {
      const names = b.completed.splice(0);
      b.completedTimer = null;
      if (names.length === 1) {
        pushToast("completed", "Automation completed", names[0], 1);
      } else {
        pushToast("completed", `${names.length} automations completed`, "", names.length);
      }
    };

    const flushFailed = () => {
      const items = b.failed.splice(0);
      b.failedTimer = null;
      if (items.length === 1) {
        pushToast("failed", "Automation failed", items[0].name, 1, items[0].error);
      } else {
        pushToast("failed", `${items.length} automations failed`, "", items.length);
      }
    };

    const runningHandler = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name ?? "";
      b.running.push(name);
      if (!b.runningTimer) b.runningTimer = setTimeout(flushRunning, BATCH_WINDOW_MS);
    };

    const completedHandler = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name ?? "";
      b.completed.push(name);
      if (!b.completedTimer) b.completedTimer = setTimeout(flushCompleted, BATCH_WINDOW_MS);
    };

    const failedHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ name: string; error?: string | null }>).detail;
      b.failed.push({ name: detail?.name ?? "", error: detail?.error });
      if (!b.failedTimer) b.failedTimer = setTimeout(flushFailed, BATCH_WINDOW_MS);
    };

    window.addEventListener(AUTOMATION_RUNNING_EVENT, runningHandler);
    window.addEventListener(AUTOMATION_COMPLETED_EVENT, completedHandler);
    window.addEventListener(AUTOMATION_FAILED_EVENT, failedHandler);
    return () => {
      window.removeEventListener(AUTOMATION_RUNNING_EVENT, runningHandler);
      window.removeEventListener(AUTOMATION_COMPLETED_EVENT, completedHandler);
      window.removeEventListener(AUTOMATION_FAILED_EVENT, failedHandler);
      if (b.runningTimer) clearTimeout(b.runningTimer);
      if (b.completedTimer) clearTimeout(b.completedTimer);
      if (b.failedTimer) clearTimeout(b.failedTimer);
    };
  }, [pushToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-3 bg-rf-surface-card border border-rf-border rounded-lg px-4 py-3 shadow-rf-lg min-w-[280px] max-w-[380px] pointer-events-auto animate-in slide-in-from-bottom-2 duration-300"
        >
          {toast.variant === "running" && (
            <Zap className="w-4 h-4 text-rf-warning flex-shrink-0 mt-0.5" />
          )}
          {toast.variant === "completed" && (
            <CheckCircle2 className="w-4 h-4 text-rf-success flex-shrink-0 mt-0.5" />
          )}
          {toast.variant === "failed" && (
            <XCircle className="w-4 h-4 text-rf-danger flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <span className="text-xs text-rf-text-muted block">
              {toast.label}
            </span>
            {toast.name && (
              <span className="text-sm font-medium text-rf-text-primary block leading-snug mt-0.5">
                {toast.name}
              </span>
            )}
            {toast.variant === "failed" && toast.error && (
              <span className="text-xs text-rf-danger block mt-0.5">
                {toast.error}
              </span>
            )}
          </div>
          <button
            onClick={() => dismiss(toast.id)}
            className="text-rf-text-muted hover:text-rf-ink-500 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
