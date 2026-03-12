"use client";

import { useState } from "react";
import { Mail, Check, ChevronDown, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GmailConnectButton } from "@/components/integrations/GmailConnectButton";
import { GmailDisconnectButton } from "@/components/integrations/GmailDisconnectButton";
import { GmailReconnectButton } from "@/components/integrations/GmailReconnectButton";

interface Props {
  companyId: string;
  accountId: string;
  initialConnection: { id: string; email: string; needsReconnect: boolean } | null;
}

export function GmailCard({ companyId, accountId, initialConnection }: Props) {
  const needsReconnect = initialConnection?.needsReconnect ?? false;
  const [isExpanded, setIsExpanded] = useState(!initialConnection || needsReconnect);

  return (
    <Card className="overflow-hidden">
      {/* ── Toggle header — always visible ──────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-4 hover:bg-rf-surface-page transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-rf-danger-bg flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-rf-danger" />
          </div>
          <span className="text-sm font-semibold text-rf-text-primary">Gmail</span>
          {initialConnection ? (
            needsReconnect ? (
              <span className="shrink-0 px-2 py-0.5 text-xs bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200">
                Reconnect required
              </span>
            ) : (
              <span className="shrink-0 px-2 py-0.5 text-xs bg-rf-success-bg text-rf-success rounded-full border border-green-200">
                Connected
              </span>
            )
          ) : (
            <span className="shrink-0 px-2 py-0.5 text-xs bg-rf-ink-100 text-rf-text-secondary rounded-full border border-rf-border">
              Not connected
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-rf-text-muted shrink-0 transition-transform duration-150 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* ── Expanded content ─────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-rf-ink-100">
          {needsReconnect && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-600" />
              <p>
                Gmail needs to be reconnected — it&apos;s missing the inbox read
                permission required for email monitoring automations. Click{" "}
                <strong>Reconnect</strong> below to fix this.
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-4">
            <div>
              <p className="text-sm text-rf-ink-500">
                Send automated emails through your Gmail account
              </p>
              {initialConnection && !needsReconnect && (
                <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                  <Check className="w-4 h-4 text-rf-success flex-shrink-0" />
                  <span className="text-rf-success font-medium">Connected</span>
                  <span className="text-rf-text-muted">•</span>
                  <span className="text-rf-text-secondary">{initialConnection.email}</span>
                </div>
              )}
              {initialConnection && needsReconnect && (
                <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-rf-text-secondary">{initialConnection.email}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:flex-shrink-0">
              {initialConnection ? (
                <>
                  <GmailReconnectButton accountId={accountId} companyId={companyId} />
                  <GmailDisconnectButton accountId={accountId} companyId={companyId} />
                </>
              ) : (
                <GmailConnectButton accountId={accountId} companyId={companyId} />
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
