"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  exiting?: boolean;
}

interface ToastAPI {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used within <ToastProvider>");
  return api;
}

/* ------------------------------------------------------------------ */
/*  Variant config                                                     */
/* ------------------------------------------------------------------ */

const variantStyles: Record<
  ToastVariant,
  { bg: string; border: string; text: string; icon: typeof CheckCircle2 }
> = {
  success: {
    bg: "bg-rf-success-bg",
    border: "border-green-200 dark:border-green-800",
    text: "text-rf-success",
    icon: CheckCircle2,
  },
  error: {
    bg: "bg-rf-danger-bg",
    border: "border-red-200 dark:border-red-800",
    text: "text-rf-danger",
    icon: XCircle,
  },
  warning: {
    bg: "bg-rf-warning-bg",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-rf-warning",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-rf-info-bg",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-rf-info",
    icon: Info,
  },
};

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

const TOAST_DURATION = 4000;
const EXIT_DURATION = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_DURATION);
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), TOAST_DURATION);
    },
    [dismiss]
  );

  const api: ToastAPI = {
    success: useCallback((m: string) => push("success", m), [push]),
    error: useCallback((m: string) => push("error", m), [push]),
    warning: useCallback((m: string) => push("warning", m), [push]),
    info: useCallback((m: string) => push("info", m), [push]),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Toast stack — bottom-right */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-6 right-6 z-[70] flex flex-col-reverse gap-2 max-w-[420px] w-full pointer-events-none"
        >
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast Card                                                         */
/* ------------------------------------------------------------------ */

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const style = variantStyles[toast.variant];
  const Icon = style.icon;

  return (
    <div
      role="status"
      className={`
        pointer-events-auto flex items-start gap-3 ${style.bg} ${style.border}
        border rounded-rf-lg px-4 py-3 shadow-rf-lg
        ${toast.exiting ? "animate-[toastSlideOut_200ms_ease-in_forwards]" : "animate-[toastSlideIn_250ms_ease-out]"}
      `}
    >
      <Icon className={`w-5 h-5 ${style.text} flex-shrink-0 mt-0.5`} />
      <span className={`text-sm font-medium ${style.text} flex-1 leading-snug`}>
        {toast.message}
      </span>
      <button
        onClick={() => onDismiss(toast.id)}
        className={`${style.text} hover:opacity-70 transition-opacity flex-shrink-0 mt-0.5`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
