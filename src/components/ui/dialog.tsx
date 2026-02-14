"use client";

import { type ReactNode } from "react";
import { useEffect, useRef } from "react";

export function Dialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="rounded-lg shadow-lg backdrop:bg-black/50 backdrop:backdrop-blur-sm p-0 max-w-md w-full"
      onClick={(e) => {
        const dialog = dialogRef.current;
        if (dialog && e.target === dialog) {
          onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}

export function DialogContent({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-lg p-6">{children}</div>;
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xl font-semibold tracking-tight text-stone-900">
      {children}
    </h2>
  );
}
