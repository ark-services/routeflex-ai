import { requireAdmin } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { Puzzle } from "lucide-react";

export default async function IntegrationsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  await requireAdmin(accountId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Integrations</h1>

      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center mb-4">
            <Puzzle className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className="text-xl font-semibold text-stone-900 mb-2">
            Integrations Coming Soon
          </h2>
          <p className="text-sm text-stone-600">
            Connect RouteFlex with your favorite tools and services to streamline your workflow.
          </p>
        </div>
      </Card>
    </div>
  );
}
