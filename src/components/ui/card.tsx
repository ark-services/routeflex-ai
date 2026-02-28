import { type HTMLAttributes } from "react";

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-rf-lg border border-rf-border bg-rf-surface-card shadow-rf-sm ${className}`}
      {...props}
    />
  );
}
