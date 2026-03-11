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
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

export function useConfirmDialog(): ConfirmFn {
  const fn = useContext(ConfirmDialogContext);
  if (!fn) throw new Error("useConfirmDialog must be used within <ConfirmDialogProvider>");
  return fn;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm: ConfirmFn = useCallback((opts) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const respond = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {state?.open && (
        <ConfirmDialogModal
          {...state}
          onConfirm={() => respond(true)}
          onCancel={() => respond(false)}
        />
      )}
    </ConfirmDialogContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal                                                              */
/* ------------------------------------------------------------------ */

function ConfirmDialogModal({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const isDestructive = variant === "destructive";
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  // Auto-focus: cancel for destructive (safe default), confirm for default
  useEffect(() => {
    if (isDestructive) {
      cancelRef.current?.focus();
    } else {
      primaryRef.current?.focus();
    }
  }, [isDestructive]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-[confirmFadeIn_150ms_ease-out]"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="relative z-10 w-full sm:max-w-[420px] bg-rf-surface-card rounded-t-2xl sm:rounded-xl shadow-rf-lg animate-[confirmSlideUp_200ms_ease-out] sm:animate-[confirmScaleIn_200ms_ease-out]"
      >
        <div className="p-6 sm:p-7">
          {/* Icon + Title */}
          <div className="flex items-start gap-3.5">
            {isDestructive && (
              <div className="flex-shrink-0 mt-0.5 w-10 h-10 rounded-full bg-rf-danger-bg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rf-danger" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2
                id="confirm-title"
                className="text-lg font-semibold tracking-tight text-rf-text-primary leading-snug"
              >
                {title}
              </h2>
              <p
                id="confirm-desc"
                className="mt-1.5 text-sm text-rf-ink-500 leading-relaxed"
              >
                {description}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <Button
              ref={cancelRef}
              variant="tertiary"
              onClick={onCancel}
            >
              {cancelLabel}
            </Button>
            <Button
              ref={primaryRef}
              variant={isDestructive ? "destructive" : "primary"}
              onClick={onConfirm}
            >
              {confirmLabel ?? (isDestructive ? "Delete" : "Confirm")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
