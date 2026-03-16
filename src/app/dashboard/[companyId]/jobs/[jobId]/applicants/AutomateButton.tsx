"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { AutomationOverlay } from "@/components/automations/AutomationOverlay";

interface AutomateButtonProps {
  companyId: string;
  jobId: string;
  jobTitle?: string;
  accountId: string;
  automations: any[];
  triggers: any[];
  groups: any[];
  automationAgents: any[];
}

export function AutomateButton({
  companyId,
  jobId,
  jobTitle,
  accountId,
  automations,
  triggers,
  groups,
  automationAgents,
}: AutomateButtonProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Auto-open when returning from the Edit Automation page (?automate=open)
  useEffect(() => {
    if (searchParams.get("automate") === "open") {
      setIsOpen(true);
      // Remove the query param so it doesn't persist on refresh
      const params = new URLSearchParams(searchParams.toString());
      params.delete("automate");
      const newUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="h-8 px-3 bg-rf-blue text-white rounded-lg hover:bg-rf-blue-dark hover:shadow-rf-md transition-all flex items-center gap-1.5 text-sm font-medium shadow-rf-sm shrink-0"
      >
        <Users className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">Agents</span>
      </button>

      <AutomationOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        companyId={companyId}
        jobId={jobId}
        jobTitle={jobTitle}
        accountId={accountId}
        automations={automations}
        triggers={triggers}
        groups={groups}
        agents={automationAgents}
      />
    </>
  );
}
