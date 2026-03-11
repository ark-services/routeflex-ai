import { forwardRef, type ButtonHTMLAttributes } from "react";

/**
 * Button Hierarchy System
 *
 * PRIMARY: Brand blue - ONLY for major product actions (Automate, Create Automation)
 * SECONDARY: Brand blue - Standard actions (Save, Add, Done)
 * TERTIARY: Outlined - Cancel, Close, dismiss actions
 * DESTRUCTIVE: Red - Delete, remove actions
 */
type Variant = "primary" | "secondary" | "tertiary" | "destructive";

const variants: Record<Variant, string> = {
  // PRIMARY - Brand blue (Important Product Actions Only)
  primary:
    "bg-rf-blue text-white hover:bg-rf-blue-dark hover:shadow-rf-md transition-all shadow-rf-sm",

  // SECONDARY - Blue tint bg + blue text (Save, Add, Done)
  secondary:
    "bg-rf-blue-tint text-rf-blue hover:bg-[#D8E8FF] transition-colors",

  // TERTIARY - Outlined (Cancel, Close)
  tertiary:
    "bg-rf-surface-card text-rf-ink-700 border-2 border-rf-ink-100 hover:bg-rf-surface-page transition-colors",

  // DESTRUCTIVE - Red (Delete)
  destructive:
    "bg-rf-danger text-white hover:bg-red-700 transition-colors shadow-rf-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = "secondary", className = "", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-rf-md px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
});
