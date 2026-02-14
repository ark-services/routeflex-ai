import { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_GROUPS = [
  { name: "New Applicants", color: "#0073ea", sort_order: 1 },
  { name: "Background Check", color: "#00c875", sort_order: 2 },
  { name: "Interview", color: "#fdab3d", sort_order: 3 },
  { name: "HR Paperwork", color: "#e2445c", sort_order: 4 },
] as const;

export type Board = {
  id: string;
};

export type BoardGroup = {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  is_collapsed: boolean | null;
};

export type GetOrCreateBoardResult =
  | {
      success: true;
      board: Board;
      groups: BoardGroup[];
    }
  | {
      success: false;
      error: string;
      technicalDetails?: string;
    };

/**
 * Gets or creates an "Applicants" board for a job with default groups.
 * This is idempotent and self-healing - it will create missing boards/groups automatically.
 *
 * @param supabase - Supabase client (must be authenticated)
 * @param companyId - Company ID
 * @param jobId - Job ID
 * @returns Board and groups, or error
 */
export async function getOrCreateApplicantsBoard(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string
): Promise<GetOrCreateBoardResult> {
  try {
    console.log(
      `[getOrCreateApplicantsBoard] Starting for job ${jobId}, company ${companyId}`
    );

    // ========================================================================
    // STEP 1: Try to get existing board
    // ========================================================================
    const { data: existingBoard, error: fetchError } = await supabase
      .from("boards")
      .select("id")
      .eq("company_id", companyId)
      .eq("job_id", jobId)
      .eq("name", "Applicants")
      .maybeSingle();

    if (fetchError) {
      console.error(
        "[getOrCreateApplicantsBoard] Error fetching board:",
        fetchError
      );
      return {
        success: false,
        error: "Failed to access board data",
        technicalDetails: fetchError.message,
      };
    }

    let boardId: string;

    if (existingBoard) {
      console.log(
        `[getOrCreateApplicantsBoard] Found existing board: ${existingBoard.id}`
      );
      boardId = existingBoard.id;
    } else {
      // ========================================================================
      // STEP 2: Create board if it doesn't exist
      // ========================================================================
      console.log("[getOrCreateApplicantsBoard] Board not found, creating...");

      const { data: newBoard, error: createError } = await supabase
        .from("boards")
        .upsert(
          {
            company_id: companyId,
            job_id: jobId,
            name: "Applicants",
          },
          {
            onConflict: "job_id",
            ignoreDuplicates: false,
          }
        )
        .select("id")
        .single();

      if (createError || !newBoard) {
        console.error(
          "[getOrCreateApplicantsBoard] Failed to create board:",
          createError
        );
        return {
          success: false,
          error: "Failed to create board. Please check permissions.",
          technicalDetails: createError?.message,
        };
      }

      console.log(
        `[getOrCreateApplicantsBoard] Created new board: ${newBoard.id}`
      );
      boardId = newBoard.id;
    }

    // ========================================================================
    // STEP 3: Get existing groups for this board
    // ========================================================================
    const { data: existingGroups, error: groupsFetchError } = await supabase
      .from("board_groups")
      .select("id, name, sort_order, color, is_collapsed")
      .eq("company_id", companyId)
      .eq("board_id", boardId)
      .order("sort_order", { ascending: true });

    if (groupsFetchError) {
      console.error(
        "[getOrCreateApplicantsBoard] Error fetching groups:",
        groupsFetchError
      );
      return {
        success: false,
        error: "Failed to access board groups",
        technicalDetails: groupsFetchError.message,
      };
    }

    // ========================================================================
    // STEP 4: Create default groups if none exist
    // ========================================================================
    if (!existingGroups || existingGroups.length === 0) {
      console.log(
        "[getOrCreateApplicantsBoard] No groups found, creating defaults..."
      );

      const groupsToCreate = DEFAULT_GROUPS.map((g) => ({
        board_id: boardId,
        company_id: companyId,
        name: g.name,
        color: g.color,
        sort_order: g.sort_order,
      }));

      const { data: newGroups, error: createGroupsError } = await supabase
        .from("board_groups")
        .upsert(groupsToCreate, {
          onConflict: "board_id,name",
          ignoreDuplicates: false,
        })
        .select("id, name, sort_order, color, is_collapsed");

      if (createGroupsError || !newGroups || newGroups.length === 0) {
        console.error(
          "[getOrCreateApplicantsBoard] Failed to create groups:",
          createGroupsError
        );
        return {
          success: false,
          error: "Failed to create board groups",
          technicalDetails: createGroupsError?.message,
        };
      }

      console.log(
        `[getOrCreateApplicantsBoard] Created ${newGroups.length} groups`
      );

      return {
        success: true,
        board: { id: boardId },
        groups: newGroups,
      };
    }

    // ========================================================================
    // SUCCESS: Return existing board and groups
    // ========================================================================
    console.log(
      `[getOrCreateApplicantsBoard] Success - board ${boardId} with ${existingGroups.length} groups`
    );

    return {
      success: true,
      board: { id: boardId },
      groups: existingGroups,
    };
  } catch (error) {
    console.error("[getOrCreateApplicantsBoard] Unexpected error:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
      technicalDetails: error instanceof Error ? error.message : String(error),
    };
  }
}
