"use client";

import { useState, useEffect, useCallback } from "react";
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
  message: string;
  error?: string | null;
}

const DISMISS_AFTER_MS = 3500;

export function AutomationToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (variant: ToastVariant, message: string, error?: string | null) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, variant, message, error }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss]
  );

  useEffect(() => {
    const runningHandler = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name ?? "";
      const message = name ? `Automation Running: ${name}` : "Automation Running";
      addToast("running", message);
    };

    const completedHandler = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name ?? "";
      const message = name ? `Automation Completed: ${name}` : "Automation Completed";
      addToast("completed", message);
    };

    const failedHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ name: string; error?: string | null }>).detail;
      const name = detail?.name ?? "";
      const message = name ? `Automation Failed: ${name}` : "Automation Failed";
      addToast("failed", message, detail?.error);
    };

    window.addEventListener(AUTOMATION_RUNNING_EVENT, runningHandler);
    window.addEventListener(AUTOMATION_COMPLETED_EVENT, completedHandler);
    window.addEventListener(AUTOMATION_FAILED_EVENT, failedHandler);
    return () => {
      window.removeEventListener(AUTOMATION_RUNNING_EVENT, runningHandler);
      window.removeEventListener(AUTOMATION_COMPLETED_EVENT, completedHandler);
      window.removeEventListener(AUTOMATION_FAILED_EVENT, failedHandler);
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-3 bg-white border border-stone-200 rounded-lg px-4 py-3 shadow-lg min-w-[300px] max-w-[420px] pointer-events-auto animate-in slide-in-from-bottom-2 duration-300"
        >
          {toast.variant === "running" && (
            <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          )}
          {toast.variant === "completed" && (
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
          )}
          {toast.variant === "failed" && (
            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-stone-800 block truncate">
              {toast.message}
            </span>
            {toast.variant === "failed" && toast.error && (
              <span className="text-xs text-red-500 block truncate mt-0.5">
                {toast.error}
              </span>
            )}
          </div>
          <button
            onClick={() => dismiss(toast.id)}
            className="text-stone-400 hover:text-stone-600 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
