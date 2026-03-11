"use client";

import { useMemo } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface PipelineSummaryProps {
  stages: PipelineStage[];
  totalApplicants: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PipelineSummary({ stages }: PipelineSummaryProps) {
  const segments = useMemo(() => {
    const visibleTotal = stages.reduce((sum, s) => sum + s.count, 0);

    if (visibleTotal === 0) {
      const even = 100 / Math.max(stages.length, 1);
      return stages.map((s) => ({ ...s, pct: even }));
    }

    const MIN_PCT = 6;
    const ZERO_PCT = 6;
    const zeroCount = stages.filter((s) => s.count === 0).length;
    const zeroReserved = zeroCount * ZERO_PCT;
    const nonZero = stages.filter((s) => s.count > 0);
    const reservedPct = nonZero.length * MIN_PCT;
    const availableForNonZero = 100 - zeroReserved;

    return stages.map((s) => {
      if (s.count === 0) return { ...s, pct: ZERO_PCT };
      const raw =
        (s.count / visibleTotal) * (availableForNonZero - reservedPct) +
        MIN_PCT;
      return { ...s, pct: raw };
    });
  }, [stages]);

  if (stages.length === 0) return null;

  return (
    <div className="px-8 py-1">
      <style>{`
        @keyframes pipeSegGrow {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        .pipe-seg {
          transform-origin: left center;
          animation: pipeSegGrow 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>

      {/* Single-row: bar segments with count + name overlaid below each */}
      <div className="flex items-end gap-px">
        {segments.map((seg, i) => (
          <div
            key={seg.id}
            className="min-w-0 flex flex-col items-center"
            style={{ width: `${seg.pct}%` }}
          >
            {/* Bar segment */}
            <div
              className={`w-full h-[5px] ${i === 0 ? "rounded-l-full" : ""} ${i === segments.length - 1 ? "rounded-r-full" : ""} relative ${seg.count > 0 ? "pipe-seg" : ""}`}
              style={{
                backgroundColor:
                  seg.count > 0 ? seg.color : "var(--rf-ink-100)",
                opacity: seg.count > 0 ? 1 : 0.3,
                animationDelay: seg.count > 0 ? `${i * 70}ms` : undefined,
              }}
            >
              {seg.count > 0 && (
                <div
                  className="absolute inset-0 rounded-[inherit]"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(255,255,255,0.25) 0%, transparent 60%)",
                  }}
                />
              )}
            </div>

            {/* Compact label: count · name on one line */}
            <div className="flex items-baseline gap-1 mt-1 max-w-full px-0.5">
              <span
                className="text-[11px] font-bold tabular-nums leading-none shrink-0"
                style={{ color: seg.count > 0 ? seg.color : undefined }}
              >
                <span className={seg.count === 0 ? "text-rf-ink-300" : ""}>
                  {seg.count}
                </span>
              </span>
              <span className="text-[8px] font-semibold text-rf-ink-500 uppercase tracking-wider truncate leading-none hidden sm:inline">
                {seg.name}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
