import { requireAdmin } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { Mail, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GmailConnectButton } from "@/components/integrations/GmailConnectButton";
import { GmailDisconnectButton } from "@/components/integrations/GmailDisconnectButton";

export default async function IntegrationsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  await requireAdmin(accountId);

  const supabase = await createClient();
  const { data: gmailCred } = await supabase
    .from('integration_credentials')
    .select('id, metadata')
    .eq('account_id', accountId)
    .eq('integration_type', 'gmail')
    .eq('is_active', true)
    .maybeSingle();

  const isConnected = !!gmailCred;
  const connectedEmail = gmailCred?.metadata?.email;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Integrations</h1>
      <p className="text-sm text-stone-600">Connect external services for automations</p>

      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center">
              <Mail className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-stone-900">Gmail</h3>
              <p className="text-sm text-stone-600 mt-1">
                Send automated emails through your Gmail account
              </p>
              {isConnected && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-700 font-medium">Connected</span>
                  <span className="text-stone-500">• {connectedEmail}</span>
                </div>
              )}
            </div>
          </div>
          {isConnected ? (
            <GmailDisconnectButton accountId={accountId} />
          ) : (
            <GmailConnectButton accountId={accountId} />
          )}
        </div>
      </Card>
    </div>
  );
}
