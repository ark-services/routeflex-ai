/**
 * RouteFlex Logo Components
 *
 * Uses CSS custom properties (--rf-icon-stroke, --rf-wm-route, --rf-wm-flex)
 * so the logo auto-adapts to light/dark mode.
 */

export function RouteFlexLogo({
  size = "default",
  className = "",
}: {
  size?: "nav" | "default" | "large";
  className?: string;
}) {
  const dimensions = {
    nav: { icon: 22, text: 20, gap: 10 },
    default: { icon: 36, text: 28, gap: 13 },
    large: { icon: 48, text: 36, gap: 16 },
  };

  const d = dimensions[size];

  return (
    <div className={`flex items-center ${className}`} style={{ gap: d.gap }}>
      <svg
        width={d.icon}
        height={d.icon}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 8 L20 24 L4 40"
          stroke="var(--rf-icon-stroke)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24 8 L40 24 L24 40"
          stroke="var(--rf-icon-stroke)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.28"
        />
      </svg>
      <span
        className="font-sans leading-none"
        style={{
          fontWeight: 900,
          fontSize: d.text,
          letterSpacing: "-0.025em",
          color: "var(--rf-wm-route)",
        }}
      >
        Route
        <span style={{ color: "var(--rf-wm-flex)" }}>Flex</span>
      </span>
    </div>
  );
}

export function RouteFlexIcon({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-label="RouteFlex"
    >
      <title>RouteFlex</title>
      <path
        d="M4 8 L20 24 L4 40"
        stroke="var(--rf-icon-stroke)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 8 L40 24 L24 40"
        stroke="var(--rf-icon-stroke)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.28"
      />
    </svg>
  );
}
