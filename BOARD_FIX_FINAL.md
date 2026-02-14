# Board Creation & Application Submission Fix

## Problems Fixed

### 1. Board Creation Failing with ON CONFLICT Error
**Error**: `"there is no unique or exclusion constraint matching the ON CONFLICT specification"`

**Cause**:
- `getOrCreateApplicantsBoard` used `upsert({ ... }, { onConflict: "job_id" })`
- PostgREST's `onConflict` inference requires a proper UNIQUE constraint
- Schema only had partial unique index: `boards_job_id_unique_idx WHERE job_id IS NOT NULL`
- Partial indexes don't work with PostgREST's ON CONFLICT inference

### 2. Applications Submitted but Not Appearing on Board
**Symptom**: Application shows "Application Submitted!" but board shows 0 applicants

**Causes**:
- Public apply action used `.single()` to get board → failed if board didn't exist
- Not using the `getOrCreateApplicantsBoard` helper (self-healing)
- Position always set to `0` instead of calculating next position
- No self-healing if board/groups missing

---

## Solutions Implemented

### 1. Fixed `getOrCreateApplicantsBoard` - No More ON CONFLICT

**Old approach (BROKEN)**:
```typescript
const { data: newBoard } = await supabase
  .from("boards")
  .upsert({ company_id, job_id, name: "Applicants" }, {
    onConflict: "job_id"  // ❌ Requires proper UNIQUE constraint
  })
  .select("id")
  .single();
```

**New approach (ROBUST)**:
```typescript
// 1. Try to fetch existing board
const { data: existingBoard } = await supabase
  .from("boards")
  .select("id")
  .eq("company_id", companyId)
  .eq("job_id", jobId)
  .eq("name", "Applicants")
  .maybeSingle();

if (existingBoard) {
  boardId = existingBoard.id;
} else {
  // 2. Insert new board (plain INSERT, no upsert)
  const { data: newBoard, error: createError } = await supabase
    .from("boards")
    .insert({ company_id, job_id, name: "Applicants" })
    .select("id")
    .maybeSingle();

  if (createError) {
    // 3. If duplicate key (23505), race condition - re-fetch
    if (createError.code === "23505") {
      const { data: retryBoard } = await supabase
        .from("boards")
        .select("id")
        .eq("company_id", companyId)
        .eq("job_id", jobId)
        .eq("name", "Applicants")
        .maybeSingle();

      boardId = retryBoard.id;
    } else {
      throw createError; // Real error
    }
  } else {
    boardId = newBoard.id;
  }
}
```

**Benefits**:
- ✅ No dependency on PostgREST ON CONFLICT inference
- ✅ Works with any index type (partial or full)
- ✅ Handles race conditions (concurrent creates)
- ✅ Idempotent and safe

### 2. Fixed Group Creation - Idempotent Insert

**Old approach (BROKEN)**:
```typescript
const { data: newGroups } = await supabase
  .from("board_groups")
  .upsert(groupsToCreate, {
    onConflict: "board_id,name"  // ❌ Same ON CONFLICT issue
  })
  .select();
```

**New approach (ROBUST)**:
```typescript
// 1. Fetch existing groups
const { data: existingGroups } = await supabase
  .from("board_groups")
  .select("id, name, sort_order, color, is_collapsed")
  .eq("board_id", boardId);

// 2. Find which groups are missing
const existingNames = new Set(existingGroups.map(g => g.name));
const groupsToCreate = DEFAULT_GROUPS.filter(g => !existingNames.has(g.name));

// 3. Insert only missing groups
if (groupsToCreate.length > 0) {
  const { error } = await supabase
    .from("board_groups")
    .insert(groupInserts);

  // Ignore duplicate errors (code 23505) from race conditions
  if (error && error.code !== "23505") {
    throw error;
  }

  // 4. Re-fetch all groups to get complete list
  const { data: allGroups } = await supabase
    .from("board_groups")
    .select("...")
    .eq("board_id", boardId);

  return allGroups;
}
```

**Benefits**:
- ✅ Only inserts missing groups (efficient)
- ✅ Ignores duplicate errors from race conditions
- ✅ Re-fetches to get complete list after insert
- ✅ Idempotent

### 3. Fixed Public Apply Action - Uses Helper + Correct Position

**Old approach (BROKEN)**:
```typescript
// Get board with .single() - fails if missing ❌
const { data: board } = await supabase
  .from("boards")
  .select("id")
  .eq("job_id", jobId)
  .single();

// Get group with .single() - fails if missing ❌
const { data: group } = await supabase
  .from("board_groups")
  .select("id")
  .eq("board_id", board.id)
  .single();

// Create applicant with position = 0 ❌
const { data: applicant } = await supabase
  .from("applicants")
  .insert({
    ...,
    board_id: board.id,
    group_id: group.id,
    position: 0  // ❌ Always 0!
  });
```

**New approach (ROBUST)**:
```typescript
// 1. Get or create board and groups (self-healing) ✅
const boardResult = await getOrCreateApplicantsBoard(
  supabase,
  form.company_id,
  jobId
);

if (!boardResult.success) {
  return { error: boardResult.error };
}

const { board, groups } = boardResult;

// 2. Find "New Applicants" group ✅
const newApplicantsGroup = groups.find(g => g.name === "New Applicants");

// 3. Calculate next position correctly ✅
const { data: maxPositionData } = await supabase
  .from("applicants")
  .select("position")
  .eq("group_id", newApplicantsGroup.id)
  .order("position", { ascending: false })
  .limit(1)
  .maybeSingle();

const nextPosition = maxPositionData ? maxPositionData.position + 1 : 0;

// 4. Create applicant with correct values ✅
const { data: applicant } = await supabase
  .from("applicants")
  .insert({
    company_id: form.company_id,
    job_id: jobId,
    board_id: board.id,
    group_id: newApplicantsGroup.id,
    full_name: fullName,
    email: email || "",
    phone: phone || "",
    status: "applied",
    position: nextPosition,  // ✅ Correct position
    resume_path: resumePath,
  });
```

**Benefits**:
- ✅ Self-healing: board/groups auto-created if missing
- ✅ Correct position: no overlaps, proper ordering
- ✅ Always sets board_id and group_id correctly
- ✅ Applications always appear on board

---

## Files Changed

```
src/lib/boards/
└── getOrCreateApplicantsBoard.ts    (MODIFIED)
    - Replaced upsert with select-insert-retry pattern
    - Handles duplicate key errors (23505)
    - Idempotent group creation

src/app/apply/[jobId]/[token]/
└── actions.ts                        (MODIFIED)
    - Uses getOrCreateApplicantsBoard helper
    - Calculates next position correctly
    - Self-healing board/group setup

supabase/migrations/
└── 00018_add_board_id_to_groups.sql (UNCHANGED)
    - Partial unique index remains
    - Code doesn't depend on it for upsert
```

---

## Test Plan

### ✅ Test 1: Create Job → Visit Applicants Page (Board Missing)

**Steps**:
1. Create a new job via dashboard
2. Before visiting applicants page, delete the board:
   ```sql
   DELETE FROM boards WHERE job_id = '{jobId}';
   ```
3. Navigate to `/dashboard/{companyId}/jobs/{jobId}/applicants`

**Expected**:
- ✅ Page loads without errors
- ✅ Console logs show:
  ```
  [getOrCreateApplicantsBoard] Board not found, creating...
  [getOrCreateApplicantsBoard] Created new board: {boardId}
  [getOrCreateApplicantsBoard] Creating 4 missing groups...
  [getOrCreateApplicantsBoard] Success - board {boardId} with 4 groups
  ```
- ✅ Board displays with 4 empty groups
- ✅ No "Board Error" message

**Verify in DB**:
```sql
-- Check board was created
SELECT id, job_id, name FROM boards WHERE job_id = '{jobId}';

-- Check groups were created with board_id
SELECT id, board_id, name, sort_order
FROM board_groups
WHERE board_id = (SELECT id FROM boards WHERE job_id = '{jobId}')
ORDER BY sort_order;
```

### ✅ Test 2: Submit Application → Check Board

**Steps**:
1. Get public apply link for job
2. Fill out and submit application form
3. Wait for "Application Submitted!" success message
4. Navigate to `/dashboard/{companyId}/jobs/{jobId}/applicants`

**Expected**:
- ✅ Application submits successfully
- ✅ Console logs show:
  ```
  [Application Submit] Getting or creating board for job: {jobId}
  [getOrCreateApplicantsBoard] Found existing board: {boardId}
  [Application Submit] Using board: {boardId} group: {groupId}
  [Application Submit] Creating applicant: { fullName, email, phone }
  [Application Submit] Applicant created: {applicantId}
  [Application Submit] Field values inserted: {count}
  [Application Submit] SUCCESS
  ```
- ✅ Applicant appears in "New Applicants" group on board
- ✅ Applicant card shows name, email, other fields

**Verify in DB**:
```sql
-- Check applicant was created with correct links
SELECT
  id,
  full_name,
  email,
  job_id,
  board_id,
  group_id,
  position
FROM applicants
WHERE job_id = '{jobId}'
ORDER BY created_at DESC
LIMIT 1;

-- Verify board_id and group_id are set
-- Should return: job_id={jobId}, board_id={boardId}, group_id={groupId}

-- Check field values were inserted
SELECT COUNT(*)
FROM applicant_field_values
WHERE applicant_id = '{applicantId}';
-- Should return: count >= 1 (depends on form fields filled)

-- Check group is "New Applicants"
SELECT bg.name, bg.board_id
FROM board_groups bg
JOIN applicants a ON a.group_id = bg.id
WHERE a.id = '{applicantId}';
-- Should return: name = "New Applicants", board_id = {boardId}
```

### ✅ Test 3: Submit Multiple Applications → Check Position

**Steps**:
1. Submit 3 applications for the same job
2. Navigate to applicants board
3. Check the order in "New Applicants" group

**Expected**:
- ✅ All 3 applicants appear
- ✅ Each has unique position value (0, 1, 2)
- ✅ No overlapping positions
- ✅ Applicants appear in submission order

**Verify in DB**:
```sql
SELECT
  full_name,
  position,
  created_at
FROM applicants
WHERE job_id = '{jobId}'
  AND group_id = (
    SELECT id FROM board_groups
    WHERE board_id = (SELECT id FROM boards WHERE job_id = '{jobId}')
    AND name = 'New Applicants'
  )
ORDER BY position;

-- Expected: position values 0, 1, 2 (or consecutive sequence)
```

### ✅ Test 4: Concurrent Board Creation (Race Condition)

**Steps**:
1. Create a job
2. Delete the board
3. In two browser tabs simultaneously:
   - Tab 1: Navigate to applicants page
   - Tab 2: Submit an application via public form

**Expected**:
- ✅ Both tabs succeed (no errors)
- ✅ Only ONE board created (no duplicates)
- ✅ Both operations use the same board
- ✅ Console logs show one creates, one finds existing or retries after 23505

**Verify in DB**:
```sql
-- Should return exactly 1 board
SELECT COUNT(*) FROM boards WHERE job_id = '{jobId}';

-- Should return 4 groups (not 8)
SELECT COUNT(*)
FROM board_groups
WHERE board_id = (SELECT id FROM boards WHERE job_id = '{jobId}');
```

### ✅ Test 5: Board Exists, Groups Missing (Self-Healing)

**Steps**:
1. Create job (board + groups auto-created)
2. Delete just the groups:
   ```sql
   DELETE FROM board_groups
   WHERE board_id = (SELECT id FROM boards WHERE job_id = '{jobId}');
   ```
3. Submit an application

**Expected**:
- ✅ Submission succeeds
- ✅ Console logs show:
  ```
  [getOrCreateApplicantsBoard] Found existing board: {boardId}
  [getOrCreateApplicantsBoard] Creating 4 missing groups...
  ```
- ✅ 4 groups auto-created
- ✅ Applicant appears in "New Applicants"

**Verify in DB**:
```sql
-- Should return 4 groups
SELECT name, sort_order
FROM board_groups
WHERE board_id = (SELECT id FROM boards WHERE job_id = '{jobId}')
ORDER BY sort_order;
```

### ✅ Test 6: Submission with Board Already Exists

**Steps**:
1. Create job (board exists)
2. Submit application
3. Check logs and board

**Expected**:
- ✅ Submission succeeds
- ✅ Console shows:
  ```
  [getOrCreateApplicantsBoard] Found existing board: {boardId}
  [getOrCreateApplicantsBoard] Success - board {boardId} with 4 groups
  ```
- ✅ No board creation (uses existing)
- ✅ Applicant appears immediately

---

## Error Scenarios to Test

### ❌ Test 7: Invalid Job ID
**Steps**: Submit application with non-existent job ID
**Expected**: Error message, no crash

### ❌ Test 8: RLS Failure (User Not Company Member)
**Steps**: Try to create board as non-member
**Expected**: Permission error with technical details in dev mode

### ❌ Test 9: Missing Required Field
**Steps**: Submit form without required field
**Expected**: Validation error, no applicant created

---

## Success Criteria

✅ **Board Creation**:
- Works without ON CONFLICT errors
- Handles race conditions gracefully
- Creates board + groups in one call
- Idempotent (safe to call multiple times)

✅ **Application Submission**:
- Applicants appear on board immediately
- Correct group_id ("New Applicants")
- Correct board_id (job's board)
- Correct position (sequential)
- All field values saved

✅ **Self-Healing**:
- Missing boards auto-created
- Missing groups auto-created
- No crashes or "recreate job" messages

✅ **Data Integrity**:
- No duplicate boards per job
- No duplicate groups per board
- All applicants linked correctly

---

## SQL Verification Queries

```sql
-- 1. Check board setup for a job
SELECT
  b.id as board_id,
  b.job_id,
  b.name as board_name,
  COUNT(DISTINCT bg.id) as group_count,
  COUNT(DISTINCT a.id) as applicant_count
FROM boards b
LEFT JOIN board_groups bg ON bg.board_id = b.id
LEFT JOIN applicants a ON a.board_id = b.id
WHERE b.job_id = '{jobId}'
GROUP BY b.id, b.job_id, b.name;

-- Expected: 1 board, 4 groups, N applicants

-- 2. Check applicant linkage
SELECT
  a.full_name,
  a.email,
  a.position,
  bg.name as group_name,
  bg.board_id,
  COUNT(afv.id) as field_value_count
FROM applicants a
JOIN board_groups bg ON bg.id = a.group_id
LEFT JOIN applicant_field_values afv ON afv.applicant_id = a.id
WHERE a.job_id = '{jobId}'
GROUP BY a.id, a.full_name, a.email, a.position, bg.name, bg.board_id
ORDER BY a.position;

-- Expected: Each applicant has group_name, board_id, and field_value_count > 0

-- 3. Check for orphaned applicants (wrong linkage)
SELECT
  a.id,
  a.full_name,
  a.job_id,
  a.board_id,
  a.group_id,
  b.id as board_exists,
  bg.id as group_exists,
  bg.board_id as group_board_id
FROM applicants a
LEFT JOIN boards b ON b.id = a.board_id
LEFT JOIN board_groups bg ON bg.id = a.group_id
WHERE a.job_id = '{jobId}';

-- Expected: All applicants have board_exists, group_exists, and group_board_id = board_id
```

---

**Date**: 2026-02-14
**Status**: ✅ Fixed & Ready for Testing
**Commit**: `9107b7d` Fix board creation and ensure submitted applications appear on board
