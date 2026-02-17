import { requireAdmin } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { Mail, Check } from "lucide-react";
import { GmailConnectButton } from "@/components/integrations/GmailConnectButton";
import { GmailDisconnectButton } from "@/components/integrations/GmailDisconnectButton";
import { GmailReconnectButton } from "@/components/integrations/GmailReconnectButton";
import { IntegrationsClient } from "./IntegrationsClient";
import { getGmailConnection } from "@/components/integrations/actions";

export default async function IntegrationsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  await requireAdmin(accountId);

  // Get Gmail connection using new per-user flow (with fallback to old account-level)
  const gmailConnection = await getGmailConnection(accountId);
  const isConnected = !!gmailConnection;
  const connectedEmail = gmailConnection?.email;

  return (
    <IntegrationsClient>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Integrations</h1>
        <p className="text-sm text-stone-600">Connect external services for automations</p>

        <Card className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                <Mail className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Gmail</h3>
                <p className="text-sm text-stone-600 mt-1">
                  Send automated emails through your Gmail account
                </p>
                {isConnected && (
                  <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-green-700 font-medium">Connected</span>
                    <span className="text-stone-500">• {connectedEmail}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:flex-shrink-0">
              {isConnected ? (
                <>
                  <GmailReconnectButton accountId={accountId} />
                  <GmailDisconnectButton accountId={accountId} />
                </>
              ) : (
                <GmailConnectButton accountId={accountId} />
              )}
            </div>
          </div>
        </Card>
      </div>
    </IntegrationsClient>
  );
}
