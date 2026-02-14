import ApplicantsBoard from "./ApplicantsBoard";
import { createClient } from "@/lib/supabase/server";
import { seedDefaultBoardColumns } from "./actions";
import { redirect } from "next/navigation";

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
    .single();

  if (!company) redirect("/");

  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", company.account_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/");

  // Verify job exists and belongs to company
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .single();

  if (!job) redirect(`/dashboard/${companyId}`);

  // Seed default columns if needed
  await seedDefaultBoardColumns(companyId, jobId);

  // Get the board ID for this job
  const { data: board } = await supabase
    .from("boards")
    .select("id")
    .eq("company_id", companyId)
    .or('name.eq.Applicants,name.ilike.%Applicants%')
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!board) throw new Error("Applicants board not found");

  const { data: groups, error: groupErr } = await supabase
    .from("board_groups")
    .select("id,name,sort_order,color,is_collapsed")
    .eq("company_id", companyId)
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });

  if (groupErr) throw new Error(groupErr.message);

  // Filter applicants by jobId
  const { data: applicants, error: appErr } = await supabase
    .from("applicants")
    .select(
      "id,full_name,email,phone,status,created_at,resume_path,group_id,position,job_id"
    )
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .order("position", { ascending: true });

  if (appErr) throw new Error(appErr.message);

  // Fetch board columns
  const { data: columns, error: colErr } = await supabase
    .from("board_columns")
    .select("id,board_id,name,type,is_system,sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });

  if (colErr) throw new Error(colErr.message);

  // Fetch status labels for all status-type columns
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

    if (labelErr) throw new Error(labelErr.message);
    statusLabels = labels ?? [];
  }

  // Fetch all cell values for applicants
  const applicantIds = (applicants ?? []).map((a) => a.id);
  let cells: any[] = [];
  if (applicantIds.length > 0) {
    const { data: cellData, error: cellErr } = await supabase
      .from("board_cells")
      .select("applicant_id,column_id,value_text,value_number,value_date,value_status_label_id")
      .in("applicant_id", applicantIds);

    if (cellErr) throw new Error(cellErr.message);
    cells = cellData ?? [];
  }

  return (
    <div className="h-full">
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
  );
}
