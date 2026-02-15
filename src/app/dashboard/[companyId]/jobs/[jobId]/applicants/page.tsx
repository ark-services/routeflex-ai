import ApplicantsBoard from "./ApplicantsBoard";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrCreateApplicantsBoard } from "@/lib/boards/getOrCreateApplicantsBoard";

function ErrorPanel({
  title,
  message,
  technicalDetails,
  showDetails = false,
}: {
  title: string;
  message: string;
  technicalDetails?: string;
  showDetails?: boolean;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-red-600 mb-4">{title}</h1>
        <p className="text-gray-700 mb-4">{message}</p>
        {showDetails && technicalDetails && (
          <details className="mt-4">
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
              Show technical details
            </summary>
            <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
              {technicalDetails}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ companyId: string; jobId: string }>;
}) {
  const { companyId, jobId } = await params;
  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Verify access to company
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, slug, account_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) redirect("/");

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) redirect("/");

  // Verify job exists and belongs to company
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!job) redirect(`/dashboard/${companyId}`);

  // ============================================================================
  // Get or create the applicants board (self-healing)
  // ============================================================================
  const boardResult = await getOrCreateApplicantsBoard(
    supabase,
    companyId,
    jobId
  );

  if (!boardResult.success) {
    const isDev = process.env.NODE_ENV === "development";
    return (
      <ErrorPanel
        title="Board Error"
        message={
          boardResult.error ||
          "Unable to load or create the applicants board. Please check your permissions."
        }
        technicalDetails={boardResult.technicalDetails}
        showDetails={isDev}
      />
    );
  }

  const { board, groups } = boardResult;

  console.log('[Applicants Page] Board and groups loaded:', {
    boardId: board.id,
    groupCount: groups.length,
    groupNames: groups.map(g => ({ id: g.id, name: g.name })),
    companyId,
    jobId,
  });

  // ============================================================================
  // Fetch applicants for this job
  // ============================================================================
  const { data: applicants, error: appErr } = await supabase
    .from("applicants")
    .select(
      "id,full_name,email,phone,status,created_at,resume_path,group_id,position,job_id,board_id"
    )
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .order("position", { ascending: true });

  if (appErr) {
    console.error('[Applicants Page] ERROR fetching applicants:', {
      error: appErr,
      message: appErr.message,
      code: appErr.code,
      details: appErr.details,
      hint: appErr.hint,
      companyId,
      jobId,
    });
    const isDev = process.env.NODE_ENV === "development";
    return (
      <ErrorPanel
        title="Data Error"
        message="Failed to load applicants"
        technicalDetails={appErr.message}
        showDetails={isDev}
      />
    );
  }

  console.log('[Applicants Page] Applicants fetched:', {
    count: applicants?.length || 0,
    sample: applicants?.slice(0, 3).map(a => ({
      id: a.id,
      name: a.full_name,
      group_id: a.group_id,
      board_id: a.board_id,
      position: a.position,
    })) || [],
  });

  // ============================================================================
  // Fetch board columns (filter by board_id for this job's board)
  // ============================================================================
  const { data: columns, error: colErr } = await supabase
    .from("board_columns")
    .select("id,board_id,name,type,is_system,sort_order")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });

  console.log('[Applicants Page] Columns fetched:', {
    count: columns?.length || 0,
    columnNames: columns?.map(c => c.name) || [],
  });

  if (colErr) {
    const isDev = process.env.NODE_ENV === "development";
    return (
      <ErrorPanel
        title="Data Error"
        message="Failed to load board columns"
        technicalDetails={colErr.message}
        showDetails={isDev}
      />
    );
  }

  // ============================================================================
  // Fetch status labels for all status-type columns
  // ============================================================================
  const statusColumnIds = (columns ?? [])
    .filter((c) => c.type === "status")
    .map((c) => c.id);

  let statusLabels: any[] = [];
  if (statusColumnIds.length > 0) {
    const { data: labels, error: labelErr } = await supabase
      .from("board_status_labels")
      .select("id,column_id,label,color,sort_order")
      .in("column_id", statusColumnIds)
      .order("sort_order", { ascending: true });

    if (labelErr) {
      const isDev = process.env.NODE_ENV === "development";
      return (
        <ErrorPanel
          title="Data Error"
          message="Failed to load status labels"
          technicalDetails={labelErr.message}
          showDetails={isDev}
        />
      );
    }
    statusLabels = labels ?? [];
  }

  // ============================================================================
  // Fetch all cell values for applicants
  // ============================================================================
  const applicantIds = (applicants ?? []).map((a) => a.id);
  let cells: any[] = [];
  if (applicantIds.length > 0) {
    const { data: cellData, error: cellErr } = await supabase
      .from("board_cells")
      .select(
        "applicant_id,column_id,value_text,value_number,value_date,value_status_label_id"
      )
      .in("applicant_id", applicantIds);

    if (cellErr) {
      const isDev = process.env.NODE_ENV === "development";
      return (
        <ErrorPanel
          title="Data Error"
          message="Failed to load cell data"
          technicalDetails={cellErr.message}
          showDetails={isDev}
        />
      );
    }
    cells = cellData ?? [];
    console.log('[Applicants Page] Cells fetched:', {
      count: cells.length,
    });
  }

  console.log('[Applicants Page] Final data summary:', {
    boardId: board.id,
    groups: groups.length,
    applicants: applicants?.length || 0,
    columns: columns?.length || 0,
    cells: cells.length,
  });

  return (
    <div className="h-full flex flex-col">
      {/* Navigation */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <a
            href={`/dashboard/${companyId}/jobs/${jobId}/applicants`}
            className="text-sm font-medium text-gray-900 border-b-2 border-blue-600 pb-2"
          >
            Applicants Board
          </a>
          <a
            href={`/dashboard/${companyId}/jobs/${jobId}/form`}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 pb-2"
          >
            Application Form
          </a>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden">
        <ApplicantsBoard
          companyId={companyId}
          jobId={jobId}
          boardId={board.id}
          groups={(groups ?? []) as any}
          applicants={(applicants ?? []) as any}
          columns={(columns ?? []) as any}
          statusLabels={statusLabels}
          cells={cells}
        />
      </div>
    </div>
  );
}
