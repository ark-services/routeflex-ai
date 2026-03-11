"use client";

import { type ReactNode } from "react";

interface WaitlistButtonProps {
  children: ReactNode;
  className?: string;
}

export function WaitlistButton({ children, className }: WaitlistButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent("open-waitlist"))}
    >
      {children}
    </button>
  );
}
