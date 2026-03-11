import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Clock,
  BookOpen,
  ChevronRight,
  PartyPopper,
} from "lucide-react";


type ChecklistItem = {
  id: string;
  column_id: string;
  pass_label_id?: string | null;
  date_column_id?: string | null;
};

export default async function StatusPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = createServiceClient();

  // ── 1. Applicant + job + company ────────────────────────────────────────────
  const { data: applicant } = await svc
    .from("applicants")
    .select(`
      id,
      full_name,
      status,
      group_id,
      created_at,
      jobs (
        id,
        title,
        company_id,
        companies (
          id,
          name,
          logo_url
        )
      )
    `)
    .eq("portal_token", token)
    .single();

  if (!applicant) notFound();

  const job = (applicant as any).jobs;
  const isHired = applicant.status === "hired";
  const isRejected = applicant.status === "rejected";

  // ── 2. Board for this job → groups for that board only ─────────────────────
  const { data: board } = await svc
    .from("boards")
    .select("id")
    .eq("job_id", job?.id)
    .maybeSingle();

  const { data: allGroups } = await svc
    .from("board_groups")
    .select("id, name, color, sort_order, visible_to_applicants, applicant_note, settings")
    .eq("board_id", board?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("sort_order", { ascending: true });

  const visibleGroups = (allGroups ?? []).filter(
    (g: any) => g.visible_to_applicants !== false
  );

  const currentGroupIndex = visibleGroups.findIndex(
    (g: any) => g.id === applicant.group_id
  );

  // ── 3. Checklist + name data ─────────────────────────────────────────────────
  const allChecklistColumnIds = new Set<string>();
  for (const group of visibleGroups) {
    const checklist: ChecklistItem[] = (group as any).settings?.portal_checklist ?? [];
    for (const item of checklist) {
      if (item.column_id) allChecklistColumnIds.add(item.column_id);
      if ((item as any).date_column_id) allChecklistColumnIds.add((item as any).date_column_id);
    }
  }

  const checklistColumnIds = Array.from(allChecklistColumnIds);
  const columnNameMap = new Map<string, string>();
  const columnTypeMap = new Map<string, string>();
  const labelInfoMap = new Map<string, { name: string; color: string | null }>();
  const cellLabelIdMap = new Map<string, string>();
  const cellDisplayMap = new Map<string, string>();

  let displayName: string = applicant.full_name;

  if (board?.id) {
    const { data: allBoardColumns } = await svc
      .from("board_columns")
      .select("id, name, type")
      .eq("board_id", board.id);

    for (const col of allBoardColumns ?? []) {
      if (allChecklistColumnIds.has(col.id)) {
        columnNameMap.set(col.id, col.name);
        columnTypeMap.set(col.id, col.type);
      }
    }

    const firstNameCol = (allBoardColumns ?? []).find(
      (c) => c.name.trim().toLowerCase() === "first name"
    );
    const lastNameCol = (allBoardColumns ?? []).find(
      (c) => c.name.trim().toLowerCase() === "last name"
    );

    const cellFetchIds = [...checklistColumnIds];
    if (firstNameCol && !cellFetchIds.includes(firstNameCol.id))
      cellFetchIds.push(firstNameCol.id);
    if (lastNameCol && !cellFetchIds.includes(lastNameCol.id))
      cellFetchIds.push(lastNameCol.id);

    if (cellFetchIds.length > 0) {
      const [{ data: labels }, { data: cells }] = await Promise.all([
        checklistColumnIds.length > 0
          ? svc
              .from("board_status_labels")
              .select("id, label, color")
              .in("column_id", checklistColumnIds)
          : Promise.resolve({ data: [] as any[] }),
        svc
          .from("board_cells")
          .select("column_id, value_text, value_number, value_date, value_status_label_id")
          .eq("applicant_id", applicant.id)
          .in("column_id", cellFetchIds),
      ]);

      for (const label of labels ?? []) {
        labelInfoMap.set(label.id, { name: label.label, color: label.color ?? null });
      }

      for (const cell of cells ?? []) {
        if (cell.value_status_label_id) {
          cellLabelIdMap.set(cell.column_id, cell.value_status_label_id);
        } else if (cell.value_date) {
          cellDisplayMap.set(
            cell.column_id,
            new Date(cell.value_date + "T00:00:00").toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })
          );
        } else if (cell.value_text) {
          cellDisplayMap.set(cell.column_id, cell.value_text);
        } else if (cell.value_number != null) {
          cellDisplayMap.set(cell.column_id, String(cell.value_number));
        }
      }

      const fn = firstNameCol
        ? (cells ?? []).find((c) => c.column_id === firstNameCol.id)?.value_text ?? ""
        : "";
      const ln = lastNameCol
        ? (cells ?? []).find((c) => c.column_id === lastNameCol.id)?.value_text ?? ""
        : "";
      const nameFromCells = [fn, ln].filter(Boolean).join(" ");
      if (nameFromCells) displayName = nameFromCells;
    }
  }

  // ── 4. LMS enrollments ─────────────────────────────────────────────────────
  const { data: enrollments } = await svc
    .from("lms_enrollments")
    .select(`
      id,
      token,
      status,
      lms_courses (
        name,
        lms_modules (
          id,
          title,
          is_final_exam,
          sort_order
        )
      )
    `)
    .eq("applicant_id", applicant.id);

  const enrollmentIds = (enrollments ?? []).map((e: any) => e.id);
  let passedModuleIds = new Set<string>();
  if (enrollmentIds.length > 0) {
    const { data: attempts } = await svc
      .from("lms_module_attempts")
      .select("module_id")
      .in("enrollment_id", enrollmentIds)
      .eq("passed", true);
    passedModuleIds = new Set((attempts ?? []).map((a: any) => a.module_id));
  }

  // ── Applied date ────────────────────────────────────────────────────────────
  const appliedDate = new Date(applicant.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ── Helper: is a checklist item complete? ───────────────────────────────────
  function isItemComplete(item: ChecklistItem): boolean {
    const colType = columnTypeMap.get(item.column_id);
    if (colType === "status") {
      const labelId = cellLabelIdMap.get(item.column_id);
      if (!labelId) return false;
      if (item.pass_label_id) return labelId === item.pass_label_id;
      return true;
    } else {
      return cellDisplayMap.has(item.column_id);
    }
  }

  // ── Computed progress ─────────────────────────────────────────────────────
  const completedSteps = visibleGroups.filter(
    (_, idx) => isHired || idx < currentGroupIndex
  ).length;
  const totalSteps = visibleGroups.length;
  const progressPct =
    totalSteps > 0
      ? Math.max(
          Math.round((completedSteps / totalSteps) * 100),
          completedSteps > 0 ? 8 : 0
        )
      : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes portalReveal {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes activePulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--pulse-color, rgba(29,111,255,0.3)); }
          50%      { box-shadow: 0 0 0 7px transparent; }
        }
        @keyframes barGrow {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        .portal-reveal {
          opacity: 0;
          animation: portalReveal 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .portal-pulse {
          animation: activePulse 2.5s ease-in-out infinite;
        }
        .portal-bar {
          transform-origin: left center;
          animation: barGrow 900ms cubic-bezier(0.16, 1, 0.3, 1) 400ms both;
        }
      `}</style>

      <div className="space-y-6">
        {/* ── Hero card ── */}
        <div
          className="portal-reveal bg-rf-surface-card border border-rf-border rounded-2xl p-6 sm:p-8"
          style={{ animationDelay: "0ms" }}
        >
          <h1 className="text-2xl sm:text-[28px] font-extrabold text-rf-text-primary tracking-tight leading-tight font-[family-name:var(--font-darker-grotesque)]">
            {displayName}
          </h1>
          <p className="text-sm text-rf-text-secondary mt-1.5">
            Applied for{" "}
            <span className="font-semibold text-rf-ink-700">{job?.title}</span>
            <span className="mx-1.5 text-rf-ink-300">&middot;</span>
            {appliedDate}
          </p>

          {/* Progress bar */}
          {!isRejected && totalSteps > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-rf-text-secondary uppercase tracking-wider">
                  Progress
                </span>
                <span className="text-xs font-bold tabular-nums text-rf-text-primary">
                  {completedSteps} of {totalSteps} steps
                </span>
              </div>
              <div className="h-[7px] bg-rf-ink-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full portal-bar"
                  style={{
                    backgroundColor:
                      completedSteps === totalSteps
                        ? "var(--rf-success)"
                        : "var(--rf-blue)",
                    width: `${progressPct}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Hired celebration ── */}
        {isHired && (
          <div
            className="portal-reveal relative overflow-hidden rounded-2xl p-6 sm:p-8"
            style={{
              background:
                "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%)",
              animationDelay: "80ms",
            }}
          >
            {/* Decorative circles */}
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/25" />
            <div className="absolute bottom-3 right-20 w-10 h-10 rounded-full bg-white/15" />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm flex-shrink-0">
                <PartyPopper className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-extrabold text-emerald-900 font-[family-name:var(--font-darker-grotesque)]">
                  You&apos;re hired!
                </p>
                <p className="text-sm text-emerald-700 mt-0.5 leading-relaxed">
                  Welcome to the team &mdash; we&apos;ll be in touch with next steps.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Rejected notice ── */}
        {isRejected && (
          <div
            className="portal-reveal bg-rf-surface-card border border-rf-border rounded-2xl p-6"
            style={{ animationDelay: "80ms" }}
          >
            <p className="font-semibold text-rf-ink-700">
              Thank you for applying
            </p>
            <p className="text-sm text-rf-text-secondary mt-1 leading-relaxed">
              We appreciate your interest and will keep your application on file
              for future opportunities.
            </p>
          </div>
        )}

        {/* ── Pipeline timeline ── */}
        {!isRejected && totalSteps > 0 && (
          <div
            className="portal-reveal"
            style={{ animationDelay: "120ms" }}
          >
            <h2 className="text-[11px] font-semibold text-rf-text-secondary uppercase tracking-wider mb-4 px-1">
              Your Progress
            </h2>

            <div className="bg-rf-surface-card border border-rf-border rounded-2xl px-5 py-6 sm:px-7">
              {visibleGroups.map((group: any, idx: number) => {
                const isCompleted = isHired || idx < currentGroupIndex;
                const isActive = !isHired && idx === currentGroupIndex;
                const checklist: ChecklistItem[] =
                  group.settings?.portal_checklist ?? [];
                const stepDelay = 180 + idx * 70;
                const isLast = idx === totalSteps - 1;

                return (
                  <div
                    key={group.id}
                    className="portal-reveal flex gap-4 sm:gap-5"
                    style={{ animationDelay: `${stepDelay}ms` }}
                  >
                    {/* ── Timeline rail ── */}
                    <div className="flex flex-col items-center w-6 flex-shrink-0">
                      {/* Node */}
                      {isCompleted ? (
                        <div className="w-6 h-6 rounded-full bg-rf-success flex items-center justify-center flex-shrink-0">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                          >
                            <path
                              d="M2.5 6L5 8.5L9.5 3.5"
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      ) : isActive ? (
                        <div
                          className="w-6 h-6 rounded-full border-[2.5px] flex items-center justify-center flex-shrink-0 portal-pulse"
                          style={{
                            borderColor: group.color ?? "#1D6FFF",
                            "--pulse-color": `${
                              group.color ?? "#1D6FFF"
                            }30`,
                          } as React.CSSProperties}
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{
                              backgroundColor: group.color ?? "#1D6FFF",
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-rf-ink-100 flex-shrink-0" />
                      )}

                      {/* Connector to next step */}
                      {!isLast && (
                        <div
                          className={`flex-1 w-0.5 rounded-full min-h-5 mt-1.5 ${
                            isCompleted ? "bg-rf-success" : "bg-rf-ink-100"
                          }`}
                        />
                      )}
                    </div>

                    {/* ── Step content ── */}
                    <div
                      className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-8"}`}
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span
                          className={`text-[15px] font-semibold leading-tight ${
                            isCompleted
                              ? "text-rf-text-muted"
                              : isActive
                              ? "text-rf-text-primary"
                              : "text-rf-text-muted"
                          }`}
                        >
                          {group.name}
                        </span>

                        {isActive && (
                          <span
                            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${
                                group.color ?? "#1D6FFF"
                              }12`,
                              color: group.color ?? "#1D6FFF",
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full animate-pulse"
                              style={{
                                backgroundColor: group.color ?? "#1D6FFF",
                              }}
                            />
                            Current
                          </span>
                        )}
                      </div>

                      {/* Note — only on active step */}
                      {isActive && group.applicant_note && (
                        <p className="text-sm text-rf-text-secondary mt-2 leading-relaxed">
                          {group.applicant_note}
                        </p>
                      )}

                      {/* Checklist items */}
                      {!isCompleted && checklist.length > 0 && (
                        <div className="mt-3 space-y-2.5">
                          {checklist.map((item) => {
                            const done = isItemComplete(item);
                            const colName =
                              columnNameMap.get(item.column_id) ?? "\u2014";
                            const colType =
                              columnTypeMap.get(item.column_id) ?? "text";
                            const currentLabelId = cellLabelIdMap.get(
                              item.column_id
                            );
                            const currentLabel = currentLabelId
                              ? labelInfoMap.get(currentLabelId)
                              : null;
                            const currentDisplayValue = cellDisplayMap.get(
                              item.column_id
                            );
                            const linkedDateValue = item.date_column_id
                              ? cellDisplayMap.get(item.date_column_id) ?? null
                              : null;

                            return (
                              <div
                                key={item.id}
                                className="flex items-start gap-2.5"
                              >
                                {/* Check indicator */}
                                {done ? (
                                  <div className="w-[18px] h-[18px] mt-px rounded-full flex items-center justify-center flex-shrink-0 bg-[var(--rf-success-bg)]">
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 10 10"
                                      fill="none"
                                    >
                                      <path
                                        d="M2 5L4.2 7.2L8 3"
                                        stroke="var(--rf-success)"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  </div>
                                ) : (
                                  <div className="w-[18px] h-[18px] mt-px rounded-full border-[1.5px] border-rf-ink-300 flex-shrink-0" />
                                )}

                                {/* Item label + value */}
                                <div className="flex-1 min-w-0 flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                                  <span
                                    className={`text-sm leading-snug ${
                                      done
                                        ? "text-rf-text-muted"
                                        : "text-rf-text-secondary"
                                    }`}
                                  >
                                    {colName}
                                  </span>

                                  {/* Status column: colored label badge */}
                                  {colType === "status" && currentLabel && (
                                    <span
                                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                                      style={{
                                        backgroundColor: currentLabel.color
                                          ? `${currentLabel.color}18`
                                          : "#f3f4f6",
                                        color:
                                          currentLabel.color ?? "#6b7280",
                                      }}
                                    >
                                      {currentLabel.name}
                                    </span>
                                  )}

                                  {/* Linked date column shown inline */}
                                  {colType === "status" &&
                                    item.date_column_id &&
                                    (linkedDateValue || isActive) && (
                                      <span
                                        className={`text-xs ${
                                          linkedDateValue
                                            ? done
                                              ? "text-rf-text-muted"
                                              : "text-rf-ink-500 font-medium"
                                            : "text-rf-text-muted italic"
                                        }`}
                                      >
                                        {linkedDateValue ??
                                          "No date scheduled"}
                                      </span>
                                    )}

                                  {/* Standalone date column */}
                                  {colType === "date" &&
                                    (currentDisplayValue || isActive) && (
                                      <span
                                        className={`text-xs ${
                                          currentDisplayValue
                                            ? done
                                              ? "text-rf-text-muted"
                                              : "text-rf-ink-500 font-medium"
                                            : "text-rf-text-muted italic"
                                        }`}
                                      >
                                        {currentDisplayValue ??
                                          "No date scheduled"}
                                      </span>
                                    )}

                                  {/* Text / number column */}
                                  {colType !== "status" &&
                                    colType !== "date" &&
                                    currentDisplayValue && (
                                      <span className="text-xs text-rf-ink-500">
                                        {currentDisplayValue}
                                      </span>
                                    )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Training progress ── */}
        {(enrollments ?? []).length > 0 && (
          <div
            className="portal-reveal space-y-2"
            style={{
              animationDelay: `${200 + totalSteps * 70}ms`,
            }}
          >
            <h2 className="text-[11px] font-semibold text-rf-text-secondary uppercase tracking-wider px-1">
              Required Training
            </h2>
            <div className="space-y-3">
              {(enrollments ?? []).map((enrollment: any) => {
                const course = enrollment.lms_courses;
                const allModules: any[] = (
                  (course?.lms_modules ?? []) as any[]
                ).sort((a: any, b: any) => a.sort_order - b.sort_order);
                const regularModules = allModules.filter(
                  (m: any) => !m.is_final_exam
                );
                const passedCount = regularModules.filter((m: any) =>
                  passedModuleIds.has(m.id)
                ).length;
                const courseCompleted = enrollment.status === "completed";
                const progressWidth =
                  regularModules.length > 0
                    ? Math.round(
                        (passedCount / regularModules.length) * 100
                      )
                    : 0;

                return (
                  <div
                    key={enrollment.id}
                    className="bg-rf-surface-card border border-rf-border rounded-2xl overflow-hidden"
                  >
                    {/* Course header */}
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            courseCompleted
                              ? "bg-rf-success-bg"
                              : "bg-rf-blue-tint"
                          }`}
                        >
                          {courseCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-rf-success" />
                          ) : (
                            <BookOpen className="w-5 h-5 text-rf-blue" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-rf-text-primary">
                            {course?.name}
                          </p>
                          <p className="text-xs text-rf-text-secondary mt-0.5">
                            {courseCompleted
                              ? "Course completed"
                              : `${passedCount} of ${regularModules.length} modules complete`}
                          </p>
                        </div>
                        {!courseCompleted && (
                          <Link
                            href={`/learn/${enrollment.token}`}
                            className="flex items-center gap-1 text-xs font-semibold text-rf-blue hover:text-blue-800 flex-shrink-0 px-3 py-1.5 rounded-full bg-rf-blue-tint hover:bg-blue-100 transition-colors"
                          >
                            {passedCount > 0 ? "Resume" : "Start"}
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>

                      {/* Progress bar for incomplete courses */}
                      {!courseCompleted && regularModules.length > 0 && (
                        <div className="mt-3 h-1.5 bg-rf-ink-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rf-blue rounded-full portal-bar"
                            style={{
                              width: `${progressWidth}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Module list */}
                    <div className="border-t border-rf-ink-100 divide-y divide-rf-ink-100">
                      {regularModules.map((module: any, mIdx: number) => {
                        const passed = passedModuleIds.has(module.id);
                        const prevPassed =
                          mIdx === 0 ||
                          passedModuleIds.has(regularModules[mIdx - 1].id);
                        const locked = !passed && !prevPassed;

                        return (
                          <div
                            key={module.id}
                            className="flex items-center gap-3 px-5 py-3"
                          >
                            <div className="flex-shrink-0">
                              {passed ? (
                                <div className="w-4.5 h-4.5 rounded-full bg-rf-success-bg flex items-center justify-center">
                                  <svg
                                    width="9"
                                    height="9"
                                    viewBox="0 0 10 10"
                                    fill="none"
                                  >
                                    <path
                                      d="M2 5L4.2 7.2L8 3"
                                      stroke="var(--rf-success)"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </div>
                              ) : locked ? (
                                <Circle className="w-4 h-4 text-rf-text-muted" />
                              ) : (
                                <Clock className="w-4 h-4 text-rf-blue-light" />
                              )}
                            </div>
                            <p
                              className={`text-sm flex-1 ${
                                passed
                                  ? "text-rf-text-muted"
                                  : locked
                                  ? "text-rf-text-muted"
                                  : "text-rf-ink-700"
                              }`}
                            >
                              {module.title}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!isRejected &&
          visibleGroups.length === 0 &&
          (enrollments ?? []).length === 0 && (
            <div
              className="portal-reveal bg-rf-surface-card border border-rf-border rounded-2xl p-10 text-center"
              style={{ animationDelay: "100ms" }}
            >
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: "var(--rf-blue-tint)" }}
              >
                <Clock className="w-7 h-7 text-rf-blue" />
              </div>
              <p className="text-sm font-semibold text-rf-text-primary">
                Application Under Review
              </p>
              <p className="text-sm text-rf-text-secondary mt-1.5 leading-relaxed">
                Your application is being reviewed. We&apos;ll be in touch soon.
              </p>
            </div>
          )}
      </div>
    </>
  );
}
