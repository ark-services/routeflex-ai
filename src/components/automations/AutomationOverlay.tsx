"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { ManageTab } from "./ManageTab";
import { CreateTab } from "./CreateTab";
import { HistoryTab } from "./HistoryTab";
import { AutomationRunHistoryPanel } from "./AutomationRunHistoryPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Automation {
  id: string;
  name: string;
  is_enabled: boolean;
  trigger_key: string;
  filter: any;
  created_at: string;
  updated_at: string;
  automation_actions: Array<{
    id: string;
    type: string;
    config: any;
    sort_order: number;
  }>;
}

interface Trigger {
  id: string;
  key: string;
  name: string;
  description: string;
}

interface Group {
  id: string;
  name: string;
  color: string;
}

interface AutomationOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  jobId: string;
  jobTitle?: string;
  accountId: string;
  automations: Automation[];
  triggers: Trigger[];
  groups: Group[];
}

export function AutomationOverlay({
  isOpen,
  onClose,
  companyId,
  accountId,
  jobId,
  jobTitle,
  automations,
  triggers,
  groups,
}: AutomationOverlayProps) {
  const [activeTab, setActiveTab] = useState<"manage" | "create" | "history">(
    automations.length > 0 ? "manage" : "create"
  );
  const [key, setKey] = useState(0);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [isCreateDirty, setIsCreateDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<{ action: () => void } | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Reset to manage tab when automations change (after create)
  useEffect(() => {
    if (automations.length > 0 && !editingAutomation) {
      setActiveTab("manage");
    }
  }, [automations.length, editingAutomation]);

  const guardedAction = useCallback(
    (action: () => void) => {
      if (activeTab === "create" && isCreateDirty) {
        setConfirmDiscard({ action });
      } else {
        action();
      }
    },
    [activeTab, isCreateDirty]
  );

  if (!isOpen) return null;

  const handleCreated = () => {
    setIsCreateDirty(false);
    setEditingAutomation(null);
    setActiveTab("manage");
    setKey(k => k + 1);
    setHistoryRefreshKey(k => k + 1);
  };

  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
    setActiveTab("create");
    setKey(k => k + 1);
  };

  const handleCancelEdit = () => {
    setEditingAutomation(null);
    setActiveTab("manage");
  };

  const handleTabSwitch = (tab: "manage" | "create" | "history") => {
    if (tab !== activeTab) {
      guardedAction(() => setActiveTab(tab));
    }
  };

  const handleClose = () => {
    guardedAction(onClose);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-gray-900/10 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
        onClick={handleClose}
      >
        <div
          className="bg-rf-surface-card rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-6xl h-[92vh] sm:h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
              Automations{jobTitle && <span className="text-gray-400 font-normal"> &middot; {jobTitle}</span>}
            </h2>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-4 sm:px-8 flex-shrink-0">
            {(["manage", "create", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabSwitch(tab)}
                className={`px-4 py-3 font-medium transition-colors relative capitalize ${
                  activeTab === tab
                    ? "text-rf-blue"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rf-blue" />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content - Scrollable Area */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {activeTab === "manage" && (
              <div className="flex-1 overflow-y-auto">
                <ManageTab
                  key={`manage-${key}`}
                  companyId={companyId}
                  jobId={jobId}
                  automations={automations}
                  triggers={triggers}
                  onEdit={handleEdit}
                />
              </div>
            )}
            {activeTab === "create" && (
              <>
                <div className="flex-1 overflow-y-auto">
                  <CreateTab
                    key={`create-${key}`}
                    companyId={companyId}
                    jobId={jobId}
                    accountId={accountId}
                    triggers={triggers}
                    groups={groups}
                    onCreated={handleCreated}
                    editingAutomation={editingAutomation}
                    onCancelEdit={handleCancelEdit}
                    onDirtyChange={setIsCreateDirty}
                  />
                </div>
                {/* Run history sidebar — only shown when editing an existing automation */}
                {editingAutomation && (
                  <div className="w-72 flex-shrink-0 border-l border-gray-200 overflow-hidden flex flex-col">
                    <AutomationRunHistoryPanel
                      companyId={companyId}
                      jobId={jobId}
                      automationId={editingAutomation.id}
                      refreshKey={historyRefreshKey}
                    />
                  </div>
                )}
              </>
            )}
            {activeTab === "history" && (
              <div className="flex-1 overflow-y-auto">
                <HistoryTab
                  companyId={companyId}
                  jobId={jobId}
                  automations={automations}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Discard unsaved changes dialog */}
      <Dialog open={!!confirmDiscard} onClose={() => setConfirmDiscard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mb-6">
            You have unsaved changes in your automation recipe. Leaving now will discard them.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setConfirmDiscard(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-rf-surface-card border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Keep building
            </button>
            <button
              onClick={() => {
                confirmDiscard?.action();
                setConfirmDiscard(null);
                setIsCreateDirty(false);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-rf-danger rounded-lg hover:bg-red-700"
            >
              Discard
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
