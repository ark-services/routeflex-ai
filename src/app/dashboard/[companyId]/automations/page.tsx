import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AutomationsClient } from "./AutomationsClient";

export default async function AutomationsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { companyId } = await params;
  const supabase = await createClient();

  // Fetch company
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .single();

  if (!company) {
    redirect("/dashboard");
  }

  // Fetch automations
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
    .order("created_at", { ascending: false });

  // Fetch trigger types
  const { data: triggers } = await supabase
    .from("automation_triggers")
    .select("*")
    .order("key");

  // Fetch groups and columns for action builder
  const { data: boards } = await supabase
    .from("boards")
    .select("id, name")
    .eq("company_id", companyId);

  const boardIds = boards?.map((b) => b.id) || [];

  const { data: groups } = await supabase
    .from("board_groups")
    .select("id, name, board_id")
    .in("board_id", boardIds);

  return (
    <div className="min-h-screen bg-rf-surface-page p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-rf-ink-900">Automations</h1>
          <p className="text-rf-text-secondary mt-2">
            Create automations that run when triggers fire
          </p>
        </div>

        <AutomationsClient
          companyId={companyId}
          automations={automations || []}
          triggers={triggers || []}
          groups={groups || []}
        />
      </div>
    </div>
  );
}
