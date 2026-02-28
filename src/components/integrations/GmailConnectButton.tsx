"use client";
import { Plus } from "lucide-react";

interface Props {
  accountId: string;
  companyId: string;
}

export function GmailConnectButton({ accountId, companyId }: Props) {
  return (
    <button
      onClick={() =>
        (window.location.href = `/api/integrations/gmail/start?account_id=${accountId}&company_id=${companyId}`)
      }
      className="px-4 py-2 bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark transition-colors flex items-center gap-2 text-sm font-medium"
    >
      <Plus className="w-4 h-4" />
      Connect Gmail
    </button>
  );
}
