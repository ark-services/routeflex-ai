"use client";

import { useState } from "react";
import { Mail, X, Trash2 } from "lucide-react";

interface Connection {
  id: string;
  email_address: string;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

export function GmailConnectionCard({
  connection,
  accountId
}: {
  connection: Connection;
  accountId: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${connection.email_address}? Automations using this account will fail.`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/integrations/gmail/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connection.id }),
      });

      if (!response.ok) {
        throw new Error('Disconnect failed');
      }

      window.location.reload();
    } catch (err: any) {
      alert(`Failed to disconnect: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors bg-white">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
          <Mail className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{connection.email_address}</p>
          <p className="text-xs text-gray-500">
            Connected {new Date(connection.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <button
        onClick={handleDisconnect}
        disabled={loading}
        className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200 hover:border-red-300 transition-colors disabled:opacity-50 flex items-center gap-1"
      >
        <Trash2 className="w-3 h-3" />
        {loading ? 'Disconnecting...' : 'Disconnect'}
      </button>
    </div>
  );
}
