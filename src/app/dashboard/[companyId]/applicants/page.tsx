import ApplicantsBoard from "./ApplicantsBoard";
import { createClient } from "@/lib/supabase/server";
import { seedDefaultBoardColumns } from "./actions";
import { Header } from "@/components/header";
import { redirect } from "next/navigation";

export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("company_members")
    .select("role, companies(id, name, slug)")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/");

  const company = membership.companies as unknown as {
    id: string;
    name: string;
    slug: string;
  };

  // Seed default columns if needed
  await seedDefaultBoardColumns(companyId);

  const { data: groups, error: groupErr } = await supabase
    .from("board_groups")
    .select("id,name,sort_order,color,is_collapsed")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });

  if (groupErr) throw new Error(groupErr.message);

  const { data: applicants, error: appErr } = await supabase
    .from("applicants")
    .select(
      "id,full_name,email,phone,status,created_at,resume_path,group_id,position,jobs(title)"
    )
    .eq("company_id", companyId)
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
    <div className="relative -mx-6 sm:-mx-8">
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <Header companyName={company.name} companyId={companyId} />
      </div>

      <ApplicantsBoard
        companyId={companyId}
        groups={(groups ?? []) as any}
        applicants={(applicants ?? []) as any}
        columns={(columns ?? []) as any}
        statusLabels={statusLabels}
        cells={cells}
      />
    </div>
  );
}