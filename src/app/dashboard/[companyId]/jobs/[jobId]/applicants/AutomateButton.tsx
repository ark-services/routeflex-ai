"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { AutomationOverlay } from "@/components/automations/AutomationOverlay";

interface AutomateButtonProps {
  companyId: string;
  jobId: string;
  automations: any[];
  triggers: any[];
  groups: any[];
}

export function AutomateButton({
  companyId,
  jobId,
  automations,
  triggers,
  groups,
}: AutomateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 hover:shadow-lg hover:shadow-purple-500/30 transition-all flex items-center gap-2 text-sm font-medium shadow-sm"
      >
        <Zap className="w-4 h-4" />
        Automate
      </button>

      <AutomationOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        companyId={companyId}
        jobId={jobId}
        automations={automations}
        triggers={triggers}
        groups={groups}
      />
    </>
  );
}
