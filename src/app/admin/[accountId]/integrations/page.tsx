import { requireAdmin } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function IntegrationsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  await requireAdmin(accountId);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-stone-900 mb-4">Gmail Integration</h2>
        <p className="text-sm text-stone-600 mb-4">Connect your Gmail account to send automated emails.</p>
        <Button>Connect Gmail</Button>
        <p className="text-xs text-stone-400 mt-2">OAuth flow not yet implemented</p>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-stone-900 mb-4">Twilio SMS</h2>
        <p className="text-sm text-stone-600 mb-4">Configure Twilio credentials to send SMS.</p>
        <p className="text-xs text-stone-400">Form not yet implemented</p>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-stone-900 mb-4">Slack Notifications</h2>
        <p className="text-sm text-stone-600 mb-4">Add Slack webhook URL for notifications.</p>
        <p className="text-xs text-stone-400">Form not yet implemented</p>
      </Card>
    </div>
  );
}
