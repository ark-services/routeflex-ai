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
        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm font-medium"
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
