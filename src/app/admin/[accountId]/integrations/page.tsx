import { requireAdmin } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";

export default async function IntegrationsIndexPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  await requireAdmin(accountId);

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  const list = companies ?? [];

  // Exactly one company → redirect straight to its integrations page
  if (list.length === 1) {
    redirect(`/admin/${accountId}/companies/${list[0].id}/integrations`);
  }

  // Zero or many companies → show a picker
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Integrations
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          {list.length === 0
            ? "No companies found for this account."
            : "Select a company to manage its integrations."}
        </p>
      </div>

      {list.length > 0 && (
        <div className="space-y-3">
          {list.map((company) => (
            <Link
              key={company.id}
              href={`/admin/${accountId}/companies/${company.id}/integrations`}
              className="block"
            >
              <Card className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-stone-500" />
                  </div>
                  <span className="text-sm font-medium text-stone-900">
                    {company.name}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
