import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrCreateApplicantsBoard } from "@/lib/boards/getOrCreateApplicantsBoard";
import { ApplicantsBoardContainer } from "./ApplicantsBoardContainer";
import { getBoardViews } from "./view-actions";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";

const VERBOSE = false; // set to true to re-enable verbose data-loading logs

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
      <div className="bg-rf-surface-card rounded-lg shadow-md p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-rf-danger mb-4">{title}</h1>
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

  if (!company) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) redirect("/dashboard");

  const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;

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
  // The function internally uses a service-role client for all writes and
  // recovery fetches, so RLS edge-cases never block board creation.
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

  if (VERBOSE) console.log('[Applicants Page] Board and groups loaded:', {
    boardId: board.id,
    groupCount: groups.length,
    groupNames: groups.map(g => ({ id: g.id, name: g.name })),
    companyId,
    jobId,
  });

  // ============================================================================
  // Fetch applicants for this job
  // CRITICAL: Only filter by job_id and company_id (source of truth)
  // Do NOT filter by board_id, status, or any other field
  // ============================================================================
  if (VERBOSE) console.log('[Applicants Page] Fetching applicants with filters:', {
    company_id: companyId,
    job_id: jobId,
  });

  const { data: applicants, error: appErr } = await supabase
    .from("applicants")
    .select(
      "id,full_name,email,phone,status,created_at,resume_path,group_id,position,job_id,board_id,portal_token"
    )
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .order("position", { ascending: true });

  if (VERBOSE) console.log('[Applicants Page] Raw Supabase response:', {
    hasData: !!applicants,
    hasError: !!appErr,
    dataLength: applicants?.length,
    error: appErr ? {
      message: appErr.message,
      code: appErr.code,
      details: appErr.details,
      hint: appErr.hint,
    } : null,
  });

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

  if (VERBOSE) console.log('[Applicants Page] Applicants fetched:', {
    count: applicants?.length || 0,
    companyId,
    jobId,
    sample: applicants?.slice(0, 5).map(a => ({
      id: a.id,
      name: a.full_name,
      email: a.email,
      group_id: a.group_id,
      board_id: a.board_id,
      position: a.position,
      status: a.status,
    })) || [],
    allApplicants: applicants || [],
  });

  // CRITICAL DEBUG: If count is 0, run diagnostic queries only if there's a problem
  if (!applicants || applicants.length === 0) {
    const { data: { user } } = await supabase.auth.getUser();

    // Check if user has access to this company
    const { data: membership } = await supabase
      .from("account_memberships")
      .select("role, account_id")
      .eq("user_id", user?.id || '')
      .maybeSingle();

    // Check if company exists and matches
    const { data: companyCheck } = await supabase
      .from("companies")
      .select("id, account_id")
      .eq("id", companyId)
      .maybeSingle();

    // Try to count applicants (RLS might still block this)
    const { count: applicantCount } = await supabase
      .from("applicants")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);

    // Only log if there's an actual problem (not just "no applicants yet")
    const hasProblem = !user?.id || !membership ||
                       membership?.account_id !== companyCheck?.account_id ||
                       (applicantCount !== null && applicantCount !== 0);

    if (hasProblem) {
      console.warn('[Applicants Page] Zero applicants diagnostic:', {
        companyId,
        jobId,
        userId: user?.id,
        userRole: membership?.role,
        accountMatch: membership?.account_id === companyCheck?.account_id,
        applicantCountViaRLS: applicantCount,
        issue: !user?.id ? 'No auth' :
               !membership ? 'No membership' :
               membership?.account_id !== companyCheck?.account_id ? 'Account mismatch' :
               'RLS may be blocking',
      });
    }
  }

  // ============================================================================
  // Fetch board columns (filter by board_id for this job's board)
  // CRITICAL: Include field_id to map applicant_field_values to columns
  // ============================================================================
  const { data: columns, error: colErr } = await supabase
    .from("board_columns")
    .select("id,board_id,name,type,is_system,sort_order,field_id,settings,is_hidden")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });

  if (VERBOSE) console.log('[Applicants Page] Columns fetched:', {
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
  // CRITICAL: Merge data from TWO sources:
  // 1. board_cells (manual edits on the board)
  // 2. applicant_field_values (form submissions) mapped via field_id → column_id
  // ============================================================================
  const applicantIds = (applicants ?? []).map((a) => a.id);
  let cells: any[] = [];

  if (applicantIds.length > 0) {
    // Fetch manual board edits from board_cells
    const { data: boardCellData, error: boardCellErr } = await supabase
      .from("board_cells")
      .select(
        "applicant_id,column_id,value_text,value_number,value_date,value_status_label_id,value_file_path,value_bool"
      )
      .in("applicant_id", applicantIds);

    if (boardCellErr) {
      const isDev = process.env.NODE_ENV === "development";
      return (
        <ErrorPanel
          title="Data Error"
          message="Failed to load board cell data"
          technicalDetails={boardCellErr.message}
          showDetails={isDev}
        />
      );
    }

    // Fetch form submission data from applicant_field_values
    const { data: fieldValueData, error: fieldValueErr } = await supabase
      .from("applicant_field_values")
      .select(
        "applicant_id,field_id,value_text,value_number,value_bool,value_date,value_file_path"
      )
      .in("applicant_id", applicantIds);

    if (fieldValueErr) {
      const isDev = process.env.NODE_ENV === "development";
      return (
        <ErrorPanel
          title="Data Error"
          message="Failed to load applicant field values"
          technicalDetails={fieldValueErr.message}
          showDetails={isDev}
        />
      );
    }

    if (VERBOSE) console.log('[Applicants Page] Data fetched:', {
      boardCells: boardCellData?.length || 0,
      fieldValues: fieldValueData?.length || 0,
    });

    // Build a map of field_id → column_id for transformation
    const fieldToColumnMap = new Map<string, string>();
    for (const col of columns ?? []) {
      if (col.field_id) {
        fieldToColumnMap.set(col.field_id, col.id);
      }
    }

    // Build column type map: column_id → type
    const columnTypeMap = new Map<string, string>();
    for (const col of columns ?? []) {
      columnTypeMap.set(col.id, col.type);
    }

    // Build status label lookup: column_id → Map<label_text_lower, label_id>
    // Used to resolve select/radio form answers (plain text) → status label IDs
    const labelTextMap = new Map<string, Map<string, string>>();
    for (const lbl of statusLabels) {
      let inner = labelTextMap.get(lbl.column_id);
      if (!inner) {
        inner = new Map<string, string>();
        labelTextMap.set(lbl.column_id, inner);
      }
      inner.set(lbl.label.toLowerCase(), lbl.id);
    }

    if (VERBOSE) console.log('[Applicants Page] Field to column mapping:', {
      mappingCount: fieldToColumnMap.size,
      mappings: Array.from(fieldToColumnMap.entries()).map(([fieldId, colId]) => ({
        fieldId,
        columnId: colId,
        columnName: columns?.find(c => c.id === colId)?.name,
      })),
    });

    // Transform applicant_field_values into board cell format
    const unmappedFieldIds = new Set<string>();
    const transformedFieldValues = (fieldValueData ?? [])
      .map((fv) => {
        const columnId = fieldToColumnMap.get(fv.field_id);
        if (!columnId) {
          unmappedFieldIds.add(fv.field_id);
          return null;
        }

        const colType = columnTypeMap.get(columnId);

        // For status columns linked to a select/radio form field, resolve the
        // plain-text answer to a status label ID so the board renders correctly.
        let value_status_label_id: string | null = null;
        if (colType === "status" && fv.value_text) {
          const inner = labelTextMap.get(columnId);
          value_status_label_id = inner?.get(fv.value_text.toLowerCase()) ?? null;
        }

        // For file columns: encode the storage path as a StoredFile JSON array so
        // the board can render it with the correct bucket ("resumes") and generate
        // a valid signed URL. The board's array branch in getCellValue() returns it as-is.
        let resolvedValueText = fv.value_text || null;
        if (colType === "file" && fv.value_file_path && !fv.value_text) {
          const rawName = fv.value_file_path.split("/").pop() || "Resume";
          const displayName = rawName.replace(/^\d+-/, ""); // strip timestamp prefix
          resolvedValueText = JSON.stringify([{
            id: fv.value_file_path,
            name: displayName,
            path: fv.value_file_path,
            bucket: "resumes",
            type: "",
            size: 0,
            createdAt: new Date().toISOString(),
          }]);
        }

        return {
          applicant_id: fv.applicant_id,
          column_id: columnId,
          value_text: resolvedValueText,
          value_number: fv.value_number,
          value_date: fv.value_date,
          value_bool: fv.value_bool ?? null,
          value_status_label_id,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (VERBOSE) console.log('[Applicants Page] Transformed field values:', {
      totalFieldValues: fieldValueData?.length || 0,
      transformedCount: transformedFieldValues.length,
      unmappedFieldsCount: unmappedFieldIds.size,
      sample: transformedFieldValues.slice(0, 3),
    });

    // Log unmapped fields if any (these are fields that exist in the form but not as board columns)
    if (unmappedFieldIds.size > 0) {
      console.warn('[Applicants Page] Some form fields are not mapped to board columns:', {
        unmappedFieldIds: Array.from(unmappedFieldIds),
        note: 'These fields have data but no corresponding column. Create columns for these fields or they will be hidden.',
      });
    }

    // Merge board_cells and transformed field values
    // board_cells take precedence (manual edits override form values)
    const cellMap = new Map<string, any>();

    // Add transformed field values first
    for (const cell of transformedFieldValues) {
      const key = `${cell.applicant_id}::${cell.column_id}`;
      cellMap.set(key, cell);
    }

    // Override with manual board edits
    for (const cell of boardCellData ?? []) {
      const key = `${cell.applicant_id}::${cell.column_id}`;
      cellMap.set(key, cell);
    }

    cells = Array.from(cellMap.values());

    if (VERBOSE) console.log('[Applicants Page] Final merged cells:', {
      count: cells.length,
      sample: cells.slice(0, 3),
    });
  }

  if (VERBOSE) console.log('[Applicants Page] Final data summary:', {
    boardId: board.id,
    groups: groups.length,
    applicants: applicants?.length || 0,
    columns: columns?.length || 0,
    cells: cells.length,
  });

  // ============================================================================
  // Fetch automations for this job
  // ============================================================================
  const { data: automations } = await supabase
    .from("automations")
    .select(`
      id,
      name,
      is_enabled,
      trigger_key,
      filter,
      created_at,
      updated_at,
      automation_actions (
        id,
        type,
        config,
        sort_order
      )
    `)
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  // Fetch trigger types
  const { data: triggers } = await supabase
    .from("automation_triggers")
    .select("*")
    .order("key");

  // Fetch groups for automation config
  const { data: groupsForAutomation } = await supabase
    .from("board_groups")
    .select("id, name, color")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });

  // ============================================================================
  // Fetch saved board views (Monday-style view tabs)
  // ============================================================================
  const savedViews = await getBoardViews(companyId, board.id);

  // If no views exist yet, seed the default "Main table" view
  let initialViews = savedViews;
  if (savedViews.length === 0) {
    // Insert default view via direct supabase call (server-side only)
    const { data: defaultView } = await supabase
      .from("board_views")
      .insert({
        company_id: companyId,
        job_id: jobId,
        board_id: board.id,
        name: "Main table",
        query: { search: "", filters: [], logic: "and" },
        position: 0,
        is_default: true,
      })
      .select("id, name, query, position, is_default")
      .single();

    if (defaultView) {
      initialViews = [defaultView as any];
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Board container: toolbar (search · filter · integrate · automate | views) + board */}
      <div className="flex-1 overflow-hidden min-h-0">
        <ApplicantsBoardContainer
          companyId={companyId}
          jobId={jobId}
          jobTitle={job.title}
          boardId={board.id}
          groups={(groups ?? []) as any}
          applicants={(applicants ?? []) as any}
          columns={(columns ?? []) as any}
          statusLabels={statusLabels}
          cells={cells}
          initialViews={initialViews as any}
          integrationHref={`/admin/${company.account_id}/integrations`}
          accountId={company.account_id}
          automations={automations || []}
          triggers={triggers || []}
          boardGroups={groupsForAutomation || []}
          isSuperAdmin={isSuperAdmin}
        />
      </div>
    </div>
  );
}
