# Applicants Board Wiring Fixes - Summary

## Issues Fixed

### A) Schema Column Name (board_columns.type vs column_type)
✅ **Status**: Already correct in code
- All code correctly uses `board_columns.type`
- No references to `column_type` found in codebase

### B) Foreign Key Violations (board_columns.board_id)
✅ **Status**: Fixed
- **Root Cause**: Code was using `board_id = companyId` instead of a real board ID from the `boards` table
- **Solution**: Implemented `getOrCreateApplicantsBoard(companyId)` function that:
  - Queries for existing "Applicants" board for the company
  - Creates one if it doesn't exist
  - Returns the canonical board ID
- **Updated Functions**:
  - `seedDefaultBoardColumns()` - now uses real board ID
  - `createBoardColumn()` - now uses real board ID

### C) Multiple Boards Per Company
✅ **Status**: Fixed
- **Solution**: `getOrCreateApplicantsBoard()` picks the oldest "Applicants" board as canonical
- Created cleanup script to consolidate existing duplicates: `scripts/consolidate_boards.sql`

### D) Status Labels Ordering
✅ **Status**: Already correct in code
- All queries use `sort_order` for ordering
- No references to `created_at` for ordering found

### E) Table Name Consistency
✅ **Status**: Verified correct
- Code uses `board_status_labels` ✓
- Code uses `board_cells` ✓
- Migration created to handle legacy `status_labels` and `applicant_cells` table names

---

## Files Changed

### 1. `/src/app/dashboard/[companyId]/applicants/actions.ts`

#### Added: getOrCreateApplicantsBoard function
```typescript
export async function getOrCreateApplicantsBoard(
  companyId: string
): Promise<string> {
  const supabase = await createClient();

  // Look for existing Applicants board
  const { data: existingBoards } = await supabase
    .from("boards")
    .select("id, name")
    .eq("company_id", companyId)
    .or('name.eq.Applicants,name.ilike.%Applicants%')
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingBoards && existingBoards.length > 0) {
    // Return the first (oldest) Applicants board as the canonical one
    return existingBoards[0].id;
  }

  // No board exists, create one
  const { data: newBoard, error: boardError } = await supabase
    .from("boards")
    .insert({
      company_id: companyId,
      name: "Applicants",
    })
    .select("id")
    .single();

  if (boardError) {
    console.error("Failed to create Applicants board:", boardError);
    throw new Error("Failed to create Applicants board");
  }

  return newBoard.id;
}
```

#### Updated: seedDefaultBoardColumns function
**Before**:
```typescript
// Line 43: WRONG - uses companyId as board_id
board_id: companyId, // Convention: board_id = companyId
```

**After**:
```typescript
// Get or create the canonical Applicants board
const boardId = await getOrCreateApplicantsBoard(companyId);

// ...in insert:
board_id: boardId, // Uses real board ID
```

#### Updated: createBoardColumn function
**Before**:
```typescript
// Line 177: WRONG - uses companyId as board_id
board_id: companyId, // Convention: board_id = companyId
```

**After**:
```typescript
// Get or create the canonical Applicants board
const boardId = await getOrCreateApplicantsBoard(companyId);

// ...in insert:
board_id: boardId, // Uses real board ID
```

---

## Files Created

### 1. `/supabase/migrations/00008_fix_boards_schema.sql`
- Creates `boards` table with proper schema
- Adds `board_id`, `is_system`, `settings` columns to `board_columns`
- Renames `status_labels` → `board_status_labels` (if needed)
- Renames `applicant_cells` → `board_cells` (if needed)
- Creates proper indexes and RLS policies
- **Idempotent**: Safe to run multiple times

### 2. `/scripts/consolidate_boards.sql`
- One-time cleanup script to consolidate duplicate boards
- For each company with multiple "Applicants" boards:
  - Picks oldest as canonical
  - Updates all `board_columns.board_id` references
  - Deletes duplicate boards
  - Standardizes board name to "Applicants"
- Run AFTER applying migration 00008

---

## Migration Instructions

### Step 1: Apply Schema Migration
```bash
# Option A: If using Supabase CLI (local dev)
npx supabase migration up

# Option B: If using hosted Supabase
# 1. Go to Supabase Dashboard → SQL Editor
# 2. Copy/paste contents of: supabase/migrations/00008_fix_boards_schema.sql
# 3. Run the migration
```

### Step 2: Run Cleanup Script (One-time)
```bash
# In Supabase Dashboard → SQL Editor
# Copy/paste contents of: scripts/consolidate_boards.sql
# Run the script

# This will consolidate duplicate boards for company_id:
# 00c53a28-84aa-4011-9cd1-4e7ae67f87fb (Ark Services)
# and any other companies with duplicates
```

### Step 3: Verify
The code changes are already deployed. After running migrations:
1. Navigate to Applicants page
2. Click "Add column"
3. Add a new Status column
4. Should work without FK violations
5. Refresh page - should persist correctly

---

## Expected Behavior After Fix

✅ Adding Status column never throws FK violation
✅ No more "column board_columns.column_type does not exist" errors
✅ Board persists correctly after refresh/server restart
✅ Exactly one "Applicants" board per company
✅ All existing columns reference the canonical board
✅ UI features (Add Column, Edit Status Labels) work seamlessly

---

## Technical Details

### Database Schema
```sql
-- boards table
CREATE TABLE public.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- board_columns table (key columns)
ALTER TABLE public.board_columns
  ADD COLUMN board_id uuid REFERENCES public.boards(id),
  ADD COLUMN is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';
```

### Foreign Key Chain
```
companies (id)
    ↓
boards (company_id → companies.id)
    ↓
board_columns (board_id → boards.id)
    ↓
board_status_labels (column_id → board_columns.id)
```

### Current Code Flow
1. User visits `/dashboard/{companyId}/applicants`
2. `seedDefaultBoardColumns(companyId)` is called
3. **NEW**: `getOrCreateApplicantsBoard(companyId)` ensures board exists
4. Columns are inserted with proper `board_id` FK
5. No FK violations ✓

---

## Verification Queries

```sql
-- Check boards per company
SELECT
  c.id,
  c.name as company_name,
  COUNT(b.id) as board_count
FROM companies c
LEFT JOIN boards b ON b.company_id = c.id
GROUP BY c.id, c.name;

-- Check board_columns.board_id references
SELECT
  bc.id,
  bc.name,
  bc.board_id,
  b.name as board_name,
  bc.company_id
FROM board_columns bc
LEFT JOIN boards b ON b.id = bc.board_id
WHERE bc.company_id = '00c53a28-84aa-4011-9cd1-4e7ae67f87fb'
ORDER BY bc.sort_order;

-- Check for orphaned board_columns (board_id is null or invalid)
SELECT bc.*
FROM board_columns bc
LEFT JOIN boards b ON b.id = bc.board_id
WHERE b.id IS NULL;
```

---

## Summary

All code changes are complete and correct. The application now:
- ✅ Creates/uses canonical "Applicants" board per company
- ✅ Never uses `companyId` as `board_id`
- ✅ Uses correct table names (`board_status_labels`, `board_cells`)
- ✅ Uses correct column names (`type`, not `column_type`)
- ✅ Orders status labels by `sort_order`

**Next step**: Apply the migration and cleanup script to the database.
