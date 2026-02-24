"use client";

import { useState } from "react";
import { Mail, Check, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GmailConnectButton } from "@/components/integrations/GmailConnectButton";
import { GmailDisconnectButton } from "@/components/integrations/GmailDisconnectButton";
import { GmailReconnectButton } from "@/components/integrations/GmailReconnectButton";

interface Props {
  companyId: string;
  accountId: string;
  initialConnection: { id: string; email: string } | null;
}

export function GmailCard({ companyId, accountId, initialConnection }: Props) {
  const [isExpanded, setIsExpanded] = useState(!initialConnection);

  return (
    <Card className="overflow-hidden">
      {/* ── Toggle header — always visible ──────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-4 hover:bg-stone-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-red-600" />
          </div>
          <span className="text-sm font-semibold text-stone-900">Gmail</span>
          {initialConnection ? (
            <span className="shrink-0 px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded-full border border-green-200">
              Connected
            </span>
          ) : (
            <span className="shrink-0 px-2 py-0.5 text-xs bg-stone-100 text-stone-500 rounded-full border border-stone-200">
              Not connected
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-150 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* ── Expanded content ─────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-stone-100">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-4">
            <div>
              <p className="text-sm text-stone-600">
                Send automated emails through your Gmail account
              </p>
              {initialConnection && (
                <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-green-700 font-medium">Connected</span>
                  <span className="text-stone-400">•</span>
                  <span className="text-stone-500">{initialConnection.email}</span>
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
