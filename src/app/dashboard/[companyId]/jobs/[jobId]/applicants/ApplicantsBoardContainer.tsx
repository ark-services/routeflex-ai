"use client";

import { useState } from "react";
import ApplicantsBoard from "./ApplicantsBoard";
import { BoardToolbar } from "./BoardToolbar";
import type { ActiveFilter, BoardView } from "./view-actions";
import type { BoardColumn, BoardStatusLabel, BoardCell } from "@/lib/types";
import { ActivityLogDrawer } from "@/components/activity/ActivityLogDrawer";

type Group = {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  is_collapsed: boolean;
};

type ApplicantRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
  resume_path: string | null;
  jobs: { title: string } | null;
  group_id: string | null;
  position: number;
};

interface ApplicantsBoardContainerProps {
  companyId: string;
  jobId: string;
  boardId: string;
  groups: Group[];
  applicants: ApplicantRow[];
  columns: BoardColumn[];
  statusLabels: BoardStatusLabel[];
  cells: BoardCell[];
  initialViews: BoardView[];
  // Integrate / Automate
  integrationHref: string;
  accountId: string;
  automations: any[];
  triggers: any[];
  boardGroups: any[];
  // Super admin — shows "Save as Template…" button
  isSuperAdmin?: boolean;
}

export function ApplicantsBoardContainer({
  companyId,
  jobId,
  boardId,
  groups,
  applicants,
  columns,
  statusLabels,
  cells,
  initialViews,
  integrationHref,
  accountId,
  automations,
  triggers,
  boardGroups,
  isSuperAdmin = false,
}: ApplicantsBoardContainerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [activityLogOpen, setActivityLogOpen] = useState(false);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Monday-style toolbar: search · filter · integrate · automate | views */}
      <BoardToolbar
        companyId={companyId}
        jobId={jobId}
        boardId={boardId}
        columns={columns}
        statusLabels={statusLabels}
        initialViews={initialViews}
        searchQuery={searchQuery}
        activeFilters={activeFilters}
        onSearchChange={setSearchQuery}
        onFiltersChange={setActiveFilters}
        integrationHref={integrationHref}
        accountId={accountId}
        automations={automations}
        triggers={triggers}
        groups={boardGroups}
        onOpenActivityLog={() => setActivityLogOpen(true)}
        isSuperAdmin={isSuperAdmin}
      />

      {/* Board */}
      <div className="flex-1 overflow-hidden min-h-0">
        <ApplicantsBoard
          companyId={companyId}
          jobId={jobId}
          boardId={boardId}
          groups={groups as any}
          applicants={applicants as any}
          columns={columns as any}
          statusLabels={statusLabels}
          cells={cells}
          searchQuery={searchQuery}
          activeFilters={activeFilters}
        />
      </div>

      {/* Activity Log Drawer */}
      <ActivityLogDrawer
        open={activityLogOpen}
        onClose={() => setActivityLogOpen(false)}
        companyId={companyId}
        jobId={jobId}
      />
    </div>
  );
}
