"use client";
import { RefreshCw } from "lucide-react";

interface Props {
  accountId: string;
  companyId: string;
}

export function GmailReconnectButton({ accountId, companyId }: Props) {
  return (
    <button
      onClick={() =>
        (window.location.href = `/api/integrations/gmail/start?account_id=${accountId}&company_id=${companyId}`)
      }
      className="px-4 py-2 bg-rf-blue-tint text-rf-blue rounded-lg hover:bg-rf-blue-tint transition-colors flex items-center gap-2 text-sm font-medium"
    >
      <RefreshCw className="w-4 h-4" />
      Reconnect
    </button>
  );
}
