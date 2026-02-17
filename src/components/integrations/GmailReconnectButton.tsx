"use client";
import { RefreshCw } from "lucide-react";

export function GmailReconnectButton({ accountId }: { accountId: string }) {
  return (
    <button
      onClick={() => window.location.href = `/api/integrations/gmail/start?account_id=${accountId}`}
      className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2 text-sm font-medium"
    >
      <RefreshCw className="w-4 h-4" />
      Reconnect
    </button>
  );
}
