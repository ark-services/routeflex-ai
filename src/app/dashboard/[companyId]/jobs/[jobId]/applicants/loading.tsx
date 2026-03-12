/**
 * Board skeleton – shown by Next.js while the server component fetches data.
 * Mimics the toolbar + 3 board groups so the user sees instant structure.
 */

const SKELETON_GROUPS = [
  { rows: 4 },
  { rows: 3 },
  { rows: 2 },
];

const GRAY = "#9ca3af";

const COLUMN_WIDTHS = [170, 140, 120, 150, 120, 100];

function Bone({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded bg-rf-ink-100/40 animate-pulse ${className}`}
    />
  );
}

export default function BoardLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Row 1: Job title + action buttons ── */}
      <div className="flex items-center gap-3 px-8 pt-5 pb-2">
        <Bone className="h-8 w-56" />
        <div className="flex-1" />
        <Bone className="h-8 w-[88px]" />
        <Bone className="h-8 w-[96px]" />
      </div>

      {/* ── Row 2: View tabs ── */}
      <div className="flex items-center gap-1 px-8 py-1">
        <Bone className="h-8 w-24" />
      </div>

      {/* ── Row 3: Search + Filter ── */}
      <div className="flex items-center gap-2 px-8 py-2">
        <Bone className="h-8 w-[140px]" />
        <Bone className="h-8 w-[72px]" />
      </div>

      {/* ── Board groups ── */}
      <div className="flex-1 overflow-hidden min-h-0 pl-8 pt-4 pr-4">
        <div className="flex flex-col gap-8">
          {SKELETON_GROUPS.map((group, gi) => (
            <section
              key={gi}
              className="rounded-t-[14px]"
              style={{
                borderLeft: `4px solid ${GRAY}`,
                boxShadow: "0 0 0 1px rgba(15,22,35,0.08)",
              }}
            >
              {/* Group header */}
              <div className="flex items-center gap-2 px-4 h-[48px]">
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: GRAY }}
                />
                <Bone className="h-4 w-28" />
                <Bone className="h-4 w-8 rounded-full" />
              </div>

              {/* Column headers */}
              <div className="flex items-center h-[41px] border-b border-rf-border/40">
                {COLUMN_WIDTHS.map((w, ci) => (
                  <div
                    key={ci}
                    className="flex items-center px-3"
                    style={{ width: w }}
                  >
                    <Bone className="h-3 w-full" />
                  </div>
                ))}
              </div>

              {/* Rows */}
              {Array.from({ length: group.rows }).map((_, ri) => (
                <div
                  key={ri}
                  className="flex items-center h-[44px] border-b border-rf-border/20"
                >
                  {COLUMN_WIDTHS.map((w, ci) => (
                    <div
                      key={ci}
                      className="flex items-center px-3"
                      style={{ width: w }}
                    >
                      <Bone
                        className={`h-3 ${ci === 0 ? "w-3/4" : "w-2/3"}`}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
