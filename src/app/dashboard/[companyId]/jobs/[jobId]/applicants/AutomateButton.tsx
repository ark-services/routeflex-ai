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
        className="h-8 px-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 hover:shadow-md hover:shadow-purple-500/20 transition-all flex items-center gap-1.5 text-sm font-medium shadow-sm shrink-0"
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
