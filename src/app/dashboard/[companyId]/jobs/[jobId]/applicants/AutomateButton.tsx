"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { AutomationOverlay } from "@/components/automations/AutomationOverlay";

interface AutomateButtonProps {
  companyId: string;
  jobId: string;
  accountId: string;
  automations: any[];
  triggers: any[];
  groups: any[];
}

export function AutomateButton({
  companyId,
  jobId,
  accountId,
  automations,
  triggers,
  groups,
}: AutomateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-2 min-h-[44px] bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 hover:shadow-lg hover:shadow-purple-500/30 transition-all flex items-center gap-1.5 text-sm font-medium shadow-sm"
      >
        <Zap className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">Automate</span>
      </button>

      <AutomationOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        companyId={companyId}
        jobId={jobId}
        accountId={accountId}
        automations={automations}
        triggers={triggers}
        groups={groups}
      />
    </>
  );
}
