"use client";

import { useState } from "react";
import {
  FileSignature,
  Check,
  X,
  Trash2,
  Loader2,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import {
  disconnectAdobeSign,
  updateAdobeSignEnabled,
  saveAdobeSignCredentials,
  type AdobeSignConnectionData,
} from "./adobe-sign-actions";
import { AdobeSignTemplateManager } from "./AdobeSignTemplateManager";

interface Props {
  companyId: string;
  accountId: string;
  initialConnection: AdobeSignConnectionData | null;
}

export function AdobeSignCard({ companyId, accountId, initialConnection }: Props) {
  const confirm = useConfirmDialog();
  const toast = useToast();

  const [connection, setConnection] = useState(initialConnection);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Credential form state
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const isConnected = !!connection?.isConnected;
  const hasCredentials = !!connection?.clientIdMasked;

  // ── Save credentials + start OAuth ──────────────────────────────────────────
  const handleConnect = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Enter your Client ID and Client Secret first");
      return;
    }
    setLoading(true);
    try {
      await saveAdobeSignCredentials(companyId, clientId, clientSecret);
      // Credentials saved — kick off OAuth
      window.location.href = `/api/adobe-sign/start?account_id=${accountId}&company_id=${companyId}`;
    } catch (err: any) {
      toast.error(`Failed to save credentials: ${err.message}`);
      setLoading(false);
    }
  };

  // ── Re-authorize (credentials already saved) ─────────────────────────────
  const handleReauthorize = () => {
    window.location.href = `/api/adobe-sign/start?account_id=${accountId}&company_id=${companyId}`;
  };

  // ── Disconnect ──────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (
      !(await confirm({
        title: "Disconnect Adobe Sign",
        description:
          "Disconnect Adobe Sign? All eSign automations using this connection will stop working.",
        confirmLabel: "Disconnect",
        variant: "destructive",
      }))
    )
      return;

    setLoading(true);
    try {
      await disconnectAdobeSign(companyId);
      setConnection(null);
      toast.success("Adobe Sign disconnected");
    } catch (err: any) {
      toast.error(`Failed to disconnect: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Toggle enabled ──────────────────────────────────────────────────────────
  const handleToggleEnabled = async () => {
    if (!connection) return;
    const newEnabled = !connection.isEnabled;
    setLoading(true);
    try {
      await updateAdobeSignEnabled(companyId, newEnabled);
      setConnection({ ...connection, isEnabled: newEnabled });
      toast.success(newEnabled ? "Adobe Sign enabled" : "Adobe Sign paused");
    } catch (err: any) {
      toast.error(`Failed to update: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Header subtitle
  const subtitle = isConnected
    ? connection.emailAddress ?? "Connected"
    : hasCredentials
    ? `App configured (${connection!.clientIdMasked}) — authorization required`
    : "Send documents for eSignature";

  return (
    <div className="space-y-0">
      <Card className="overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-rf-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isConnected ? "bg-rf-success-bg" : "bg-rf-muted"
              }`}
            >
              <FileSignature
                className={`w-5 h-5 ${
                  isConnected ? "text-rf-success" : "text-rf-text-muted"
                }`}
              />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-rf-text-primary">
                Adobe Sign
              </p>
              <p className="text-xs text-rf-text-muted">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {connection && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  isConnected && connection.isEnabled
                    ? "bg-rf-success-bg text-rf-success"
                    : isConnected
                    ? "bg-rf-muted text-rf-text-muted"
                    : "bg-amber-500/10 text-amber-500"
                }`}
              >
                {isConnected
                  ? connection.isEnabled
                    ? "Connected"
                    : "Paused"
                  : "Needs authorization"}
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-rf-text-muted transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>

        {/* Expanded body */}
        {expanded && (
          <div className="px-5 pb-5 border-t border-rf-border">
            {isConnected ? (
              /* ── Connected state ── */
              <div className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-rf-text-muted">Account</span>
                    <p className="font-medium text-rf-text-primary">
                      {connection.emailAddress}
                    </p>
                  </div>
                  <div>
                    <span className="text-rf-text-muted">Connected</span>
                    <p className="font-medium text-rf-text-primary">
                      {new Date(connection.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="tertiary"
                    onClick={handleToggleEnabled}
                    disabled={loading}
                  >
                    {connection.isEnabled ? (
                      <>
                        <X className="w-3.5 h-3.5 mr-1" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Enable
                      </>
                    )}
                  </Button>
                  <Button
                    variant="tertiary"
                    onClick={handleDisconnect}
                    disabled={loading}
                    className="text-rf-danger hover:text-rf-danger hover:bg-rf-danger-bg"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                    )}
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Not connected state ── */
              <div className="pt-4 space-y-5">
                <p className="text-sm text-rf-text-secondary">
                  Connect your Adobe Sign (Acrobat Sign) account to send PDFs
                  for eSignature through automations.
                </p>

                {/* Setup instructions */}
                <div className="rounded-lg border border-rf-border bg-rf-muted/30 p-4 space-y-3">
                  <p className="text-xs font-semibold text-rf-text-secondary uppercase tracking-wide">
                    Setup Instructions
                  </p>
                  <ol className="space-y-2.5 text-sm text-rf-text-secondary">
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rf-accent/10 text-rf-accent text-xs font-semibold flex items-center justify-center mt-0.5">1</span>
                      <span>
                        Go to{" "}
                        <a
                          href="https://secure.adobesign.com/account/developer"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-rf-accent hover:underline inline-flex items-center gap-0.5"
                        >
                          Adobe Sign Developer Console
                          <ExternalLink className="w-3 h-3" />
                        </a>{" "}
                        and click <strong className="text-rf-text-primary">Create Application</strong>.
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rf-accent/10 text-rf-accent text-xs font-semibold flex items-center justify-center mt-0.5">2</span>
                      <span>
                        Set the application type to <strong className="text-rf-text-primary">Customer</strong>, give it a name (e.g. &ldquo;RouteFlex&rdquo;), and click <strong className="text-rf-text-primary">Save</strong>.
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rf-accent/10 text-rf-accent text-xs font-semibold flex items-center justify-center mt-0.5">3</span>
                      <span>
                        Click <strong className="text-rf-text-primary">Configure OAuth for Application</strong>. Add this redirect URI:
                        <code className="ml-1 px-1.5 py-0.5 rounded bg-rf-muted text-xs font-mono text-rf-text-primary break-all">
                          {typeof window !== "undefined" ? window.location.origin : ""}/api/adobe-sign/callback
                        </code>
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rf-accent/10 text-rf-accent text-xs font-semibold flex items-center justify-center mt-0.5">4</span>
                      <span>
                        Enable these scopes (all at <strong className="text-rf-text-primary">Account</strong> level):{" "}
                        <code className="px-1 py-0.5 rounded bg-rf-muted text-xs font-mono text-rf-text-primary">agreement_send</code>{" "}
                        <code className="px-1 py-0.5 rounded bg-rf-muted text-xs font-mono text-rf-text-primary">agreement_read</code>{" "}
                        <code className="px-1 py-0.5 rounded bg-rf-muted text-xs font-mono text-rf-text-primary">library_read</code>{" "}
                        <code className="px-1 py-0.5 rounded bg-rf-muted text-xs font-mono text-rf-text-primary">webhook_write</code>.
                        Save.
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rf-accent/10 text-rf-accent text-xs font-semibold flex items-center justify-center mt-0.5">5</span>
                      <span>
                        Copy your <strong className="text-rf-text-primary">Client ID</strong> and <strong className="text-rf-text-primary">Client Secret</strong> and paste them below.
                      </span>
                    </li>
                  </ol>
                </div>

                {/* Credential inputs */}
                <div className="space-y-3">
                  {hasCredentials && (
                    <p className="text-xs text-rf-text-muted">
                      App already configured ({connection!.clientIdMasked}). Enter new credentials below to update, or click <strong>Authorize</strong> to re-run OAuth with the saved credentials.
                    </p>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-rf-text-secondary mb-1">
                      Client ID
                    </label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder={hasCredentials ? connection!.clientIdMasked! : "Paste your Client ID"}
                      className="w-full px-3 py-2 text-sm rounded-md border border-rf-border bg-rf-surface text-rf-text-primary placeholder:text-rf-text-muted focus:outline-none focus:ring-1 focus:ring-rf-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-rf-text-secondary mb-1">
                      Client Secret
                    </label>
                    <div className="relative">
                      <input
                        type={showSecret ? "text" : "password"}
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder={hasCredentials ? "••••••••••••" : "Paste your Client Secret"}
                        className="w-full px-3 py-2 pr-9 text-sm rounded-md border border-rf-border bg-rf-surface text-rf-text-primary placeholder:text-rf-text-muted focus:outline-none focus:ring-1 focus:ring-rf-accent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rf-text-muted hover:text-rf-text-secondary"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={handleConnect} disabled={loading || (!clientId.trim() && !hasCredentials)}>
                    {loading ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <FileSignature className="w-4 h-4 mr-1.5" />
                    )}
                    {clientId.trim() ? "Save & Authorize" : "Save & Authorize"}
                  </Button>
                  {hasCredentials && !clientId.trim() && (
                    <Button variant="tertiary" onClick={handleReauthorize} disabled={loading}>
                      Authorize with saved credentials
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Template Manager (below the card, when connected) */}
      {isConnected && expanded && (
        <AdobeSignTemplateManager companyId={companyId} />
      )}
    </div>
  );
}
