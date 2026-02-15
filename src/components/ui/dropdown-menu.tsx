"use client";

import { type ReactNode, useState, useRef, useEffect } from "react";

export function DropdownMenu({
  children
}: {
  children: ReactNode | ((props: { open: boolean; setOpen: (open: boolean) => void }) => ReactNode)
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {typeof children === "function"
        ? children({ open, setOpen })
        : children}
    </div>
  );
}

export function DropdownMenuTrigger({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center focus:outline-none"
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  children,
  align = "end",
}: {
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <div
      className={`absolute top-full mt-2 w-48 rounded-lg border border-stone-200 bg-white shadow-lg z-50 ${
        align === "end" ? "right-0" : "left-0"
      }`}
    >
      <div className="py-1">{children}</div>
    </div>
  );
}

export function DropdownMenuItem({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 border-t border-stone-200" />;
}
