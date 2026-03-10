import { requireAdmin } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { Mail, Plus, X, CheckCircle, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GmailConnectionCard } from "@/components/integrations/GmailConnectionCard";

export default async function IntegrationsPage({
  params,
  searchParams: searchParamsPromise
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { accountId } = await params;
  const searchParams = await searchParamsPromise;
  await requireAdmin(accountId);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div>Not authenticated</div>;
  }

  // Fetch user's Gmail connections for this account
  const { data: connections } = await supabase
    .from('gmail_connections')
    .select('id, email_address, created_at, updated_at, revoked_at')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  const activeConnections = connections || [];

  // Check for success/error messages
  const success = searchParams.success;
  const error = searchParams.error;
  const connectedEmail = searchParams.email;

  return (
    <div className="space-y-6">
      {/* Success/Error Toasts */}
      {success === 'gmail_connected' && (
        <div className="bg-rf-success-bg border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-rf-success flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-900">Gmail connected successfully</p>
            {connectedEmail && (
              <p className="text-xs text-rf-success mt-1">Connected as {connectedEmail}</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-rf-danger-bg border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rf-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">Connection failed</p>
            <p className="text-xs text-red-700 mt-1">
              {error === 'oauth_denied' && 'You denied access to Gmail'}
              {error === 'oauth_failed' && 'OAuth flow failed'}
              {error === 'csrf_failed' && 'Security validation failed'}
              {error === 'token_exchange_failed' && 'Failed to exchange authorization code'}
              {error === 'no_email' && 'Could not retrieve email address'}
              {error === 'storage_failed' && 'Failed to store connection'}
              {!['oauth_denied', 'oauth_failed', 'csrf_failed', 'token_exchange_failed', 'no_email', 'storage_failed'].includes(error as string) && 'An unexpected error occurred'}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-rf-text-primary">Integrations</h1>
        <p className="text-sm text-rf-ink-500 mt-1">Connect your accounts to use in automations</p>
      </div>

      {/* Gmail Section */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-rf-danger-bg flex items-center justify-center">
              <Mail className="w-6 h-6 text-rf-danger" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-rf-text-primary">Gmail</h3>
              <p className="text-sm text-rf-ink-500 mt-1">
                Send emails through your Gmail account in automations
              </p>
            </div>
          </div>

          {/* Connect New Button */}
          <a
            href={`/api/integrations/gmail/start?account_id=${accountId}`}
            className="px-4 py-2 bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Connect Gmail
          </a>
        </div>

        {/* Connected Accounts */}
        {activeConnections.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-rf-text-muted uppercase tracking-wide">
              Your connected accounts
            </p>
            {activeConnections.map((connection) => (
              <GmailConnectionCard
                key={connection.id}
                connection={connection}
                accountId={accountId}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border-2 border-dashed border-rf-border rounded-lg">
            <Mail className="w-8 h-8 text-rf-text-muted mx-auto mb-2" />
            <p className="text-sm text-rf-text-secondary">No Gmail accounts connected yet</p>
            <p className="text-xs text-rf-text-muted mt-1">
              Click "Connect Gmail" above to get started
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
