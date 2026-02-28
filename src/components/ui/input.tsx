import { type InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-rf-md border border-rf-ink-100 bg-rf-surface-card px-3 py-2 text-sm text-rf-text-primary placeholder:text-rf-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-rf-blue focus:ring-offset-1 ${className}`}
      {...props}
    />
  );
}
