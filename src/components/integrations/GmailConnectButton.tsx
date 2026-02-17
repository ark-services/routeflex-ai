"use client";
import { Plus } from "lucide-react";

export function GmailConnectButton({ accountId }: { accountId: string }) {
  return (
    <button
      onClick={() => window.location.href = `/api/integrations/gmail/start?account_id=${accountId}`}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
    >
      <Plus className="w-4 h-4" />
      Connect Gmail
    </button>
  );
}
