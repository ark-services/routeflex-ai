"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { disconnectGmail } from "./actions";

interface Props {
  accountId: string;
  companyId: string;
}

export function GmailDisconnectButton({ accountId, companyId }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDisconnect = async () => {
    if (
      !confirm(
        "Disconnect Gmail? Automations using Gmail will stop working."
      )
    )
      return;
    setLoading(true);
    try {
      await disconnectGmail(companyId, accountId);
      window.location.reload();
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
    >
      <X className="w-4 h-4" />
      {loading ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
