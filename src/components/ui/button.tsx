import { type ButtonHTMLAttributes } from "react";

/**
 * Button Hierarchy System
 *
 * PRIMARY: Purple gradient - ONLY for major product actions (Automate, Create Automation)
 * SECONDARY: Solid blue - Standard actions (Save, Add, Done)
 * TERTIARY: Gray outline - Cancel, Close, dismiss actions
 * DESTRUCTIVE: Red - Delete, remove actions
 */
type Variant = "primary" | "secondary" | "tertiary" | "destructive";

const variants: Record<Variant, string> = {
  // PRIMARY - Purple gradient (Important Product Actions Only)
  primary:
    "bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 hover:shadow-lg hover:shadow-purple-500/30 transition-all shadow-sm",

  // SECONDARY - Solid blue (Save, Add, Done)
  secondary:
    "bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm",

  // TERTIARY - Gray outline (Cancel, Close)
  tertiary:
    "bg-white text-stone-700 border-2 border-stone-300 hover:bg-stone-50 transition-colors",

  // DESTRUCTIVE - Red (Delete)
  destructive:
    "bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-[10px] px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
