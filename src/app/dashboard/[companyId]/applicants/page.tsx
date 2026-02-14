import ApplicantsBoard from "./ApplicantsBoard";
import { createClient } from "@/lib/supabase/server";
import { seedDefaultBoardColumns } from "./actions";

export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  // Seed default columns if needed
  await seedDefaultBoardColumns(companyId);

  const { data: groups, error: groupErr } = await supabase
    .from("board_groups")
    .select("id,name,sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });

  if (groupErr) throw new Error(groupErr.message);

  const { data: applicants, error: appErr } = await supabase
    .from("applicants")
    .select(
      "id,full_name,email,phone,status,created_at,resume_path,group_id,jobs(title)"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

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
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
        Applicants
      </h1>
      <p className="mt-1 text-stone-500">Monday-style board view</p>

      <div className="mt-10">
        <ApplicantsBoard
          companyId={companyId}
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