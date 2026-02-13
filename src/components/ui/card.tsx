import { type HTMLAttributes } from "react";

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-stone-200/60 bg-white shadow-sm ${className}`}
      {...props}
    />
  );
}
