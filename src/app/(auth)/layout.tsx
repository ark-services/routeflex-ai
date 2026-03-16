import { RouteFlexIcon } from "@/components/ui/routeflex-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-rf-surface-page">
      {/* Ambient gradient backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(29,111,255,0.07) 0%, transparent 70%), radial-gradient(ellipse 50% 50% at 90% 80%, rgba(29,111,255,0.04) 0%, transparent 60%)",
        }}
      />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--rf-ink-500) 1px, transparent 1px), linear-gradient(90deg, var(--rf-ink-500) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Floating brand mark — top left */}
      <div className="pointer-events-none absolute left-8 top-8 opacity-10">
        <RouteFlexIcon size={64} />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 py-12">{children}</div>
    </div>
  );
}
