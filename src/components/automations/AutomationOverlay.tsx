"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { ManageTab } from "./ManageTab";
import { CreateTab } from "./CreateTab";

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
  automations,
  triggers,
  groups,
}: AutomationOverlayProps) {
  const [activeTab, setActiveTab] = useState<"manage" | "create">(
    automations.length > 0 ? "manage" : "create"
  );
  const [key, setKey] = useState(0);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);

  // Reset to manage tab when automations change (after create)
  useEffect(() => {
    if (automations.length > 0 && !editingAutomation) {
      setActiveTab("manage");
    }
  }, [automations.length, editingAutomation]);

  if (!isOpen) return null;

  const handleCreated = () => {
    setEditingAutomation(null);
    setActiveTab("manage");
    setKey(k => k + 1); // Force re-render
  };

  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
    setActiveTab("create");
    setKey(k => k + 1); // Force re-render with new editing data
  };

  const handleCancelEdit = () => {
    setEditingAutomation(null);
    setActiveTab("manage");
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/10 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-6xl h-[92vh] sm:h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Automations</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4 sm:px-8 flex-shrink-0">
          <button
            onClick={() => setActiveTab("manage")}
            className={`px-4 py-3 font-medium transition-colors relative ${
              activeTab === "manage"
                ? "text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Manage
            {activeTab === "manage" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("create")}
            className={`px-4 py-3 font-medium transition-colors relative ${
              activeTab === "create"
                ? "text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Create
            {activeTab === "create" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
        </div>

        {/* Tab Content - Scrollable Area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === "manage" && (
            <ManageTab
              key={`manage-${key}`}
              companyId={companyId}
              jobId={jobId}
              automations={automations}
              triggers={triggers}
              onEdit={handleEdit}
            />
          )}
          {activeTab === "create" && (
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
