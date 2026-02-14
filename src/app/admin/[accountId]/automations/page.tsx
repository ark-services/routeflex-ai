import { requireAdmin } from "@/lib/rbac";
import { Card } from "@/components/ui/card";

export default async function AdminAutomationsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  await requireAdmin(accountId);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-stone-900 mb-4">Automation Rules</h2>
        <p className="text-sm text-stone-600">Manage your automation rules and view execution history.</p>
        <p className="text-xs text-stone-400 mt-4">Automation management UI not yet implemented</p>
      </Card>
    </div>
  );
}
