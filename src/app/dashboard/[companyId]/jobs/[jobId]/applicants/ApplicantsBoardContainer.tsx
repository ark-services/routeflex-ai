"use client";

import { useState, useMemo } from "react";
import ApplicantsBoard from "./ApplicantsBoard";
import { BoardToolbar } from "./BoardToolbar";
import type { ActiveFilter, BoardView } from "./view-actions";
import type { BoardColumn, BoardStatusLabel, BoardCell } from "@/lib/types";
import { ActivityLogDrawer } from "@/components/activity/ActivityLogDrawer";
import type { PipelineStage } from "./PipelineSummary";

type Group = {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  is_collapsed: boolean;
  show_in_pipeline?: boolean;
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
  portal_token?: string | null;
};

interface ApplicantsBoardContainerProps {
  companyId: string;
  jobId: string;
  jobTitle: string;
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
  jobTitle,
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
  const [defaultValuesOpen, setDefaultValuesOpen] = useState(false);
  const [archiveDrawerOpen, setArchiveDrawerOpen] = useState(false);

  // Pipeline summary: count applicants per visible group
  const pipelineStages: PipelineStage[] = useMemo(() => {
    return [...groups]
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((g) => g.show_in_pipeline !== false)
      .map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        count: applicants.filter((a) => a.group_id === g.id).length,
      }));
  }, [groups, applicants]);

  // Only trigger router.refresh() after status changes when there's an enabled
  // automation that listens for status changes AND has a move_group action.
  // Without such an automation, the RSC refetch is unnecessary overhead.
  const hasStatusMoveAutomations = automations.some(
    (a) =>
      a.is_enabled &&
      a.trigger_key === "board.status_changes_to" &&
      a.automation_actions?.some((action: any) => action.type === "move_group")
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Monday-style toolbar: search · filter · integrate · automate | views */}
      <BoardToolbar
        companyId={companyId}
        jobId={jobId}
        jobTitle={jobTitle}
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
        onOpenArchive={() => setArchiveDrawerOpen(true)}
        onOpenDefaultValues={() => setDefaultValuesOpen(true)}
        isSuperAdmin={isSuperAdmin}
        pipelineStages={pipelineStages}
        totalApplicants={applicants.length}
      />

      {/* Board — pl-8 aligns groups with toolbar's px-8; pt-4 for breathing room */}
      <div className="flex-1 overflow-hidden min-h-0 pl-8 pt-4">
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
          hasStatusMoveAutomations={hasStatusMoveAutomations}
          showDefaultValues={defaultValuesOpen}
          onCloseDefaultValues={() => setDefaultValuesOpen(false)}
          showArchiveDrawer={archiveDrawerOpen}
          onCloseArchiveDrawer={() => setArchiveDrawerOpen(false)}
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
