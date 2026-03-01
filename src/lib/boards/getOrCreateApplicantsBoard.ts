import { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Service-role client that bypasses RLS.
 * Used for all write operations and the 409 recovery fetch so that
 * is_company_member() edge-cases never block board creation.
 */
function getSvc(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type GroupConfig = {
  name: string;
  color: string;
  sort_order: number;
  /** Mark this group as the default destination for new public applicants. */
  is_default_for_applications?: boolean;
};

const DEFAULT_GROUPS: GroupConfig[] = [
  { name: "New Applicants", color: "#0073ea", sort_order: 1, is_default_for_applications: true },
  { name: "Background Check", color: "#00c875", sort_order: 2 },
  { name: "Interview", color: "#fdab3d", sort_order: 3 },
  { name: "HR Paperwork", color: "#e2445c", sort_order: 4 },
];

export type Board = {
  id: string;
};

export type BoardGroup = {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  is_collapsed: boolean | null;
  is_default_for_applications: boolean;
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
 * Gets or creates an "Applicants" board for a job with specified groups.
 * This is idempotent and self-healing - it will create missing boards/groups automatically.
 *
 * All write operations and the 409-recovery fetch use a **service-role client**
 * so that RLS edge-cases (stale sessions, cross-context board creation) never
 * block board access.  The caller's auth is expected to be verified externally
 * (e.g. membership check in page.tsx).
 *
 * @param supabase - Supabase client (used for initial reads; writes use service role)
 * @param companyId - Company ID
 * @param jobId - Job ID
 * @param customGroups - Optional custom groups configuration (defaults to DEFAULT_GROUPS)
 * @returns Board and groups, or error
 */
export async function getOrCreateApplicantsBoard(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  customGroups?: GroupConfig[]
): Promise<GetOrCreateBoardResult> {
  const groupsToUse = customGroups || DEFAULT_GROUPS;
  // Service-role client for writes + recovery fetches (bypasses RLS)
  const svc = getSvc();

  try {
    console.log(
      `[getOrCreateApplicantsBoard] Starting for job ${jobId}, company ${companyId}`
    );

    // ========================================================================
    // STEP 1: Try to get existing board via service role (bypasses RLS)
    // CRITICAL: order by created_at to always get the FIRST one
    // ========================================================================
    const { data: existingBoards, error: fetchError } = await svc
      .from("boards")
      .select("id, created_at")
      .eq("company_id", companyId)
      .eq("job_id", jobId)
      .eq("name", "Applicants")
      .order("created_at", { ascending: true })
      .limit(1);

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

    const existingBoard = existingBoards && existingBoards.length > 0 ? existingBoards[0] : null;

    let boardId: string;

    if (existingBoard) {
      console.log(
        `[getOrCreateApplicantsBoard] Found existing board: ${existingBoard.id}`
      );
      boardId = existingBoard.id;
    } else {
      // ========================================================================
      // STEP 2: Create board if it doesn't exist (with duplicate key retry)
      // Uses service-role client for the INSERT
      // ========================================================================
      console.log("[getOrCreateApplicantsBoard] Board not found, creating...");

      const { data: newBoard, error: createError } = await svc
        .from("boards")
        .insert({
          company_id: companyId,
          job_id: jobId,
          name: "Applicants",
        })
        .select("id")
        .maybeSingle();

      if (createError) {
        // If duplicate key error (23505 / 409), another process created it — re-fetch
        if (createError.code === "23505") {
          console.log(
            "[getOrCreateApplicantsBoard] Duplicate key (23505), re-fetching with service role..."
          );

          // Recovery fetch — MUST use service-role client and match the exact
          // unique constraint filters so RLS can never block it.
          const { data: retryBoard, error: retryError } = await svc
            .from("boards")
            .select("id")
            .eq("company_id", companyId)
            .eq("job_id", jobId)
            .eq("name", "Applicants")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (retryError || !retryBoard) {
            console.error(
              "[getOrCreateApplicantsBoard] Failed to fetch after duplicate (service role):",
              { retryError, retryBoard, companyId, jobId }
            );
            return {
              success: false,
              error: "Failed to create or fetch board",
              technicalDetails: retryError?.message || `Board not found after 23505 conflict (company=${companyId}, job=${jobId}). This should not happen with service-role client.`,
            };
          }

          boardId = retryBoard.id;
          console.log(
            `[getOrCreateApplicantsBoard] Found board after retry: ${boardId}`
          );
        } else {
          console.error(
            "[getOrCreateApplicantsBoard] Failed to create board:",
            { code: createError.code, message: createError.message, details: createError.details }
          );
          return {
            success: false,
            error: "Failed to create board. Please check permissions.",
            technicalDetails: `${createError.code}: ${createError.message}`,
          };
        }
      } else if (!newBoard) {
        console.error("[getOrCreateApplicantsBoard] Insert returned no data");
        return {
          success: false,
          error: "Failed to create board",
          technicalDetails: "Insert succeeded but returned no data",
        };
      } else {
        console.log(
          `[getOrCreateApplicantsBoard] Created new board: ${newBoard.id}`
        );
        boardId = newBoard.id;
      }
    }

    // ========================================================================
    // STEP 3: Get existing groups for this board (service role)
    // ========================================================================
    const { data: existingGroups, error: groupsFetchError } = await svc
      .from("board_groups")
      .select("id, name, sort_order, color, is_collapsed, is_default_for_applications, settings, visible_to_applicants, applicant_note")
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
    // STEP 4: Create groups ONLY if board is brand new (no existing groups)
    // This ensures template selection is honored and not overridden on page refresh
    // ========================================================================
    const hasExistingGroups = existingGroups && existingGroups.length > 0;

    // Only create groups if this is a completely new board with no groups
    if (!hasExistingGroups) {
      console.log(
        `[getOrCreateApplicantsBoard] Board has no groups, creating ${groupsToUse.length} groups...`
      );

      const groupInserts = groupsToUse.map((g) => ({
        board_id: boardId,
        company_id: companyId,
        name: g.name,
        color: g.color,
        sort_order: g.sort_order,
        is_default_for_applications: g.is_default_for_applications ?? false,
      }));

      // Insert groups (ignore duplicates from race conditions)
      const { error: createGroupsError } = await svc
        .from("board_groups")
        .insert(groupInserts)
        .select("id");

      if (createGroupsError && createGroupsError.code !== "23505") {
        console.error(
          "[getOrCreateApplicantsBoard] Failed to create groups:",
          createGroupsError
        );
        return {
          success: false,
          error: "Failed to create board groups",
          technicalDetails: createGroupsError.message,
        };
      }

      // Re-fetch all groups to get complete list
      const { data: allGroups, error: refetchError } = await svc
        .from("board_groups")
        .select("id, name, sort_order, color, is_collapsed, is_default_for_applications, settings, visible_to_applicants, applicant_note")
        .eq("company_id", companyId)
        .eq("board_id", boardId)
        .order("sort_order", { ascending: true });

      if (refetchError) {
        console.error(
          "[getOrCreateApplicantsBoard] Error re-fetching groups:",
          refetchError
        );
        return {
          success: false,
          error: "Failed to fetch board groups",
          technicalDetails: refetchError.message,
        };
      }

      console.log(
        `[getOrCreateApplicantsBoard] Success - board ${boardId} with ${allGroups?.length || 0} groups`,
        {
          boardId,
          groupDetails: (allGroups || []).map(g => ({ id: g.id, name: g.name })),
          companyId,
          jobId,
        }
      );

      return {
        success: true,
        board: { id: boardId },
        groups: allGroups || [],
      };
    }

    // ========================================================================
    // SUCCESS: Return existing board and groups
    // ========================================================================
    console.log(
      `[getOrCreateApplicantsBoard] Success - board ${boardId} with ${existingGroups.length} groups`,
      {
        boardId,
        groupDetails: existingGroups.map(g => ({ id: g.id, name: g.name })),
        companyId,
        jobId,
      }
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
