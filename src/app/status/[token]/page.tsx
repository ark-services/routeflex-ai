import { createClient as createServiceClient } from "@supabase/supabase-js";
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

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
  const svc = getSvc();

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
  // Gather all column_ids referenced in any checklist (both primary + linked date cols)
  const allChecklistColumnIds = new Set<string>();
  for (const group of visibleGroups) {
    const checklist: ChecklistItem[] = (group as any).settings?.portal_checklist ?? [];
    for (const item of checklist) {
      if (item.column_id) allChecklistColumnIds.add(item.column_id);
      if ((item as any).date_column_id) allChecklistColumnIds.add((item as any).date_column_id);
    }
  }

  const checklistColumnIds = Array.from(allChecklistColumnIds);
  const columnNameMap = new Map<string, string>(); // columnId → display name
  const columnTypeMap = new Map<string, string>(); // columnId → 'text'|'status'|'date'|'number'
  const labelInfoMap = new Map<string, { name: string; color: string | null }>(); // labelId → info
  const cellLabelIdMap = new Map<string, string>();  // columnId → current label_id (status cols)
  const cellDisplayMap = new Map<string, string>();  // columnId → formatted display string (other cols)

  // Start with the full_name from DB; may be overridden by board cell values below
  let displayName: string = applicant.full_name;

  if (board?.id) {
    // Fetch ALL columns for this board so we can find "First Name"/"Last Name" for display
    const { data: allBoardColumns } = await svc
      .from("board_columns")
      .select("id, name, type")
      .eq("board_id", board.id);

    // Populate name/type maps for checklist columns
    for (const col of allBoardColumns ?? []) {
      if (allChecklistColumnIds.has(col.id)) {
        columnNameMap.set(col.id, col.name);
        columnTypeMap.set(col.id, col.type);
      }
    }

    // Identify first/last name columns by name (case-insensitive)
    const firstNameCol = (allBoardColumns ?? []).find(
      (c) => c.name.trim().toLowerCase() === "first name"
    );
    const lastNameCol = (allBoardColumns ?? []).find(
      (c) => c.name.trim().toLowerCase() === "last name"
    );

    // Fetch cells for: checklist columns + name columns
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

      // Build display name from board cells if available
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
      return true; // any label = complete if no specific pass label required
    } else {
      // date / text / number: any non-empty value counts
      return cellDisplayMap.has(item.column_id);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Applicant header ── */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="text-lg font-bold text-stone-900">{displayName}</p>
        <p className="text-sm text-stone-500 mt-0.5">
          Applied for <span className="font-medium text-stone-700">{job?.title}</span>
          {" · "}Applied {appliedDate}
        </p>
      </div>

      {/* ── Hired banner ── */}
      {isHired && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-3">
          <PartyPopper className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-900">You&apos;re hired!</p>
            <p className="text-sm text-green-700 mt-0.5">
              Welcome to the team. You&apos;ll be hearing from us shortly with next steps.
            </p>
          </div>
        </div>
      )}

      {/* ── Rejected state ── */}
      {isRejected && (
        <div className="bg-stone-100 border border-stone-200 rounded-xl p-5">
          <p className="font-semibold text-stone-700">Thank you for applying</p>
          <p className="text-sm text-stone-500 mt-0.5">
            We appreciate your interest. We&apos;ll keep your application on file for future opportunities.
          </p>
        </div>
      )}

      {/* ── Pipeline steps ── */}
      {!isRejected && visibleGroups.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wide px-1">
            Your Progress
          </h2>
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100">
            {visibleGroups.map((group: any, idx: number) => {
              const isCompleted = isHired || idx < currentGroupIndex;
              const isActive = !isHired && idx === currentGroupIndex;
              const checklist: ChecklistItem[] = group.settings?.portal_checklist ?? [];

              return (
                <div key={group.id} className="px-5 py-4">
                  <div className="flex items-start gap-4">
                    {/* State icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : isActive ? (
                        <div
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                          style={{ borderColor: group.color ?? "#3b82f6" }}
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: group.color ?? "#3b82f6" }}
                          />
                        </div>
                      ) : (
                        <Circle className="w-5 h-5 text-stone-300" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          isCompleted
                            ? "text-stone-400 line-through"
                            : isActive
                            ? "text-stone-900"
                            : "text-stone-400"
                        }`}
                      >
                        {group.name}
                      </p>

                      {/* Note — only on active stage */}
                      {isActive && group.applicant_note && (
                        <p className="text-sm text-stone-500 mt-1">{group.applicant_note}</p>
                      )}

                      {/* Checklist — shown for active & upcoming stages, hidden for completed */}
                      {!isCompleted && checklist.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {checklist.map((item) => {
                            const done = isActive ? isItemComplete(item) : false;
                            const colName = columnNameMap.get(item.column_id) ?? "—";
                            const colType = columnTypeMap.get(item.column_id) ?? "text";

                            // Status columns: show current label badge
                            const currentLabelId = isActive
                              ? cellLabelIdMap.get(item.column_id)
                              : null;
                            const currentLabel = currentLabelId
                              ? labelInfoMap.get(currentLabelId)
                              : null;

                            // Date / text / number columns: show display value
                            const currentDisplayValue = isActive
                              ? cellDisplayMap.get(item.column_id)
                              : null;

                            // For status items with a linked date column
                            const linkedDateValue = isActive && item.date_column_id
                              ? cellDisplayMap.get(item.date_column_id)
                              : null;

                            return (
                              <div key={item.id} className="flex items-center gap-2">
                                {done ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
                                )}
                                <span
                                  className={`text-xs leading-snug ${
                                    done ? "text-stone-400 line-through" : "text-stone-500"
                                  }`}
                                >
                                  {colName}

                                  {/* Status column: colored label badge */}
                                  {colType === "status" && currentLabel && (
                                    <span
                                      className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded font-medium"
                                      style={{
                                        backgroundColor: currentLabel.color
                                          ? `${currentLabel.color}22`
                                          : "#f3f4f6",
                                        color: currentLabel.color ?? "#6b7280",
                                      }}
                                    >
                                      {currentLabel.name}
                                    </span>
                                  )}

                                  {/* Linked date column shown inline after status badge */}
                                  {colType === "status" && item.date_column_id && isActive && (
                                    <span
                                      className={`ml-1.5 ${
                                        linkedDateValue
                                          ? done
                                            ? "text-stone-400"
                                            : "text-stone-600 font-medium"
                                          : "text-stone-400 italic"
                                      }`}
                                    >
                                      {linkedDateValue ?? "No date scheduled"}
                                    </span>
                                  )}

                                  {/* Standalone date column: show date or placeholder */}
                                  {colType === "date" && isActive && (
                                    <span
                                      className={`ml-1.5 ${
                                        currentDisplayValue
                                          ? done
                                            ? "text-stone-400"
                                            : "text-stone-600 font-medium"
                                          : "text-stone-400 italic"
                                      }`}
                                    >
                                      {currentDisplayValue ?? "No date scheduled"}
                                    </span>
                                  )}

                                  {/* Text / number column: show raw value */}
                                  {colType !== "status" &&
                                    colType !== "date" &&
                                    currentDisplayValue && (
                                      <span className="ml-1.5 text-stone-600">
                                        {currentDisplayValue}
                                      </span>
                                    )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Active badge */}
                    {isActive && (
                      <span
                        className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: `${group.color ?? "#3b82f6"}18`,
                          color: group.color ?? "#3b82f6",
                        }}
                      >
                        Current
                      </span>
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
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wide px-1">
            Required Training
          </h2>
          <div className="space-y-3">
            {(enrollments ?? []).map((enrollment: any) => {
              const course = enrollment.lms_courses;
              const allModules: any[] = ((course?.lms_modules ?? []) as any[]).sort(
                (a: any, b: any) => a.sort_order - b.sort_order
              );
              const regularModules = allModules.filter((m: any) => !m.is_final_exam);
              const passedCount = regularModules.filter((m: any) =>
                passedModuleIds.has(m.id)
              ).length;
              const courseCompleted = enrollment.status === "completed";

              return (
                <div
                  key={enrollment.id}
                  className="bg-white border border-stone-200 rounded-xl overflow-hidden"
                >
                  {/* Course header */}
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-stone-100">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        courseCompleted ? "bg-green-100" : "bg-blue-50"
                      }`}
                    >
                      {courseCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <BookOpen className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-900">{course?.name}</p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {courseCompleted
                          ? "Completed"
                          : `${passedCount} of ${regularModules.length} modules complete`}
                      </p>
                    </div>
                    {!courseCompleted && (
                      <Link
                        href={`/learn/${enrollment.token}`}
                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 flex-shrink-0"
                      >
                        {passedCount > 0 ? "Resume" : "Start"}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>

                  {/* Module list */}
                  <div className="divide-y divide-stone-50">
                    {regularModules.map((module: any, idx: number) => {
                      const passed = passedModuleIds.has(module.id);
                      const prevPassed =
                        idx === 0 || passedModuleIds.has(regularModules[idx - 1].id);
                      const locked = !passed && !prevPassed;

                      return (
                        <div
                          key={module.id}
                          className="flex items-center gap-3 px-5 py-3"
                        >
                          <div className="flex-shrink-0">
                            {passed ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : locked ? (
                              <Circle className="w-4 h-4 text-stone-200" />
                            ) : (
                              <Clock className="w-4 h-4 text-blue-400" />
                            )}
                          </div>
                          <p
                            className={`text-sm flex-1 ${
                              passed
                                ? "text-stone-400 line-through"
                                : locked
                                ? "text-stone-300"
                                : "text-stone-700"
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

      {/* ── Empty state — no groups configured ── */}
      {!isRejected && visibleGroups.length === 0 && (enrollments ?? []).length === 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
          <p className="text-sm text-stone-500">
            Your application is under review. We&apos;ll be in touch soon.
          </p>
        </div>
      )}
    </div>
  );
}
