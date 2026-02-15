# Label Color & Bulk Status Update Fixes

## Issues Fixed

### 1. Label Color Changes Not Persisting
**Problem**: When editing label colors in the Edit Status Labels modal, changes were not persisting to the database or reflecting on the board after clicking Done.

**Root Causes**:
1. `updateStatusLabel` server action didn't call `revalidatePath`
2. Modal close didn't trigger `router.refresh()` to fetch fresh data
3. Race condition: Color picker state update was async but `onUpdateLabel` was called immediately with stale state

**Fixes Applied**:

#### `actions.ts` - Enhanced `updateStatusLabel` (lines 807-861)
- Added comprehensive server logging showing labelId, updates, companyId, jobId
- Fetch existing label first to verify it exists
- Get column and board info for permission verification
- Return updated label data to confirm success
- **Re-enabled `revalidatePath()`** to ensure data is fresh when modal closes
- Log all Supabase errors with full details (message, details, hint, code)

#### `ApplicantsBoard.tsx` - Fixed Modal Close & State Race Condition
- Added `useRouter` import and `router` instance
- **Modal close callback now calls `router.refresh()`** (line 972-976)
- Fixed race condition in `onUpdateLabel`: Added optional `overrideColor` parameter to accept color directly instead of relying on async state
- Color picker now passes color as override: `onUpdateLabel(label.id, color)` (line 1981)

### 2. Bulk Status Change for Selected Rows
**Problem**: When multiple rows were selected and status changed on one, only that single row updated instead of all selected rows.

**Implementation**:

#### `actions.ts` - New `bulkUpdateStatusCells` Server Action (lines 1134-1265)
- Accepts array of applicantIds, columnId, and statusLabelId
- Validates column is a status column
- **Processes each applicant individually** to:
  1. Fetch old status value
  2. Update the cell via upsert
  3. **Fire automation trigger for EACH row** (doesn't bypass automations!)
- Returns detailed results: `{ successful, failed, errors }`
- Comprehensive logging at each step
- Continues on individual failures (doesn't fail entire bulk operation if one fails)

#### `ApplicantsBoard.tsx` - Bulk Update Detection Logic (lines 625-652)
- **Modified `onUpdateCell`** to detect bulk status changes:
  - Checks if `columnType === "status"`
  - Checks if `selectedIds.length > 1`
  - Checks if current applicant is in selected set
- If all conditions true, calls `bulkUpdateStatusCells` instead of single `updateBoardCell`
- Shows user feedback on partial failures
- **Clears selection after bulk update** for clean UX
- Falls back to single update if not a bulk operation

## RLS Verification

Verified RLS policies (from migration 00020_fix_board_rls.sql):
- ✅ **SELECT**: Members can view status labels (via board_columns join)
- ✅ **INSERT**: Members can insert status labels (via board_columns join)
- ✅ **UPDATE**: Members can update status labels (via board_columns join)
- ✅ **DELETE**: Admins can delete status labels (via board_columns join)

All policies use `is_company_member()` helper function through the board_columns join, so regular company members SHOULD have permission to update label colors.

## Testing Checklist

### Label Color Persistence
- [ ] Open Edit Status Labels modal
- [ ] Change a label color using the color picker
- [ ] Verify color changes immediately in modal (optimistic update)
- [ ] Click Done to close modal
- [ ] **Check browser console for server logs showing:**
  - `[updateStatusLabel] Updating label:` with labelId and color
  - `[updateStatusLabel] Success - label updated:` with returned data
- [ ] Verify label color is updated in the board (should see new color in status cells)
- [ ] Refresh the page manually - color should persist

### Bulk Status Change
- [ ] Select multiple rows (3+) using checkboxes
- [ ] Click on the status dropdown for one of the selected rows
- [ ] Change the status
- [ ] **Check browser console for:**
  - `[onUpdateCell] Bulk status update triggered:` showing selected applicant IDs
  - `[bulkUpdateStatusCells] Called with:` showing all applicant IDs
  - Multiple `[bulkUpdateStatusCells] Automation fired for applicant` logs (one per applicant)
  - `[bulkUpdateStatusCells] Bulk update complete:` showing success/fail counts
- [ ] Verify ALL selected rows updated to the new status
- [ ] Verify selection is cleared after update
- [ ] Check that automations triggered for each row (check automation logs/actions)

### Error Scenarios
- [ ] Try updating label color with no internet (should revert on error)
- [ ] Try bulk status update with some rows having permissions issues (should show partial failure message)
- [ ] Check all errors are logged to console with full details

## Server Logs to Monitor

When testing, watch for these key log messages:

**Label Color Update**:
```
[updateStatusLabel] Updating label: { labelId, updates, companyId, jobId }
[updateStatusLabel] Existing label: { id, column_id, label, color }
[updateStatusLabel] Column info: { board_id, company_id }
[updateStatusLabel] Success - label updated: { id, label, color }
```

**Bulk Status Update**:
```
[onUpdateCell] Bulk status update triggered: { applicantId, columnId, statusLabelId, selectedCount, selectedIds }
[bulkUpdateStatusCells] Called with: { companyId, jobId, applicantIds, applicantCount, columnId, statusLabelId }
[bulkUpdateStatusCells] Column and label info: { columnName, boardId, newLabel }
[bulkUpdateStatusCells] Automation fired for applicant [id]: { oldLabel, newLabel }
[bulkUpdateStatusCells] Bulk update complete: { total, successful, failed, errors }
```

## Architecture Notes

- **No architecture changes**: Fixes are minimal and preserve existing patterns
- **Automations still work**: Each bulk status change fires automation triggers individually (critical for workflow integrity)
- **Optimistic updates preserved**: UI updates immediately, reverts on error
- **Backward compatible**: Single row updates still work exactly as before
- **RLS respected**: All updates go through regular Supabase client with RLS enabled

## Files Modified

1. `/src/app/dashboard/[companyId]/jobs/[jobId]/applicants/actions.ts`
   - Enhanced `updateStatusLabel` with logging and revalidatePath
   - Added `bulkUpdateStatusCells` action

2. `/src/app/dashboard/[companyId]/jobs/[jobId]/applicants/ApplicantsBoard.tsx`
   - Added `useRouter` and `router.refresh()` on modal close
   - Added bulk update detection in `onUpdateCell`
   - Fixed race condition in `onUpdateLabel` with override parameter
   - Imported `bulkUpdateStatusCells` action
