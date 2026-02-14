# Implementation Summary: Default Groups + Sidebar Kebab Menu

## Overview
This implementation adds two major features:
1. **Default board groups and dummy applicant on job creation**
2. **Kebab menu for Applicants link in sidebar with board operations**

---

## Files Changed

### 1. `src/components/layout/actions.ts`
**Changes:**
- Added `DEFAULT_GROUPS` constant with 5 default groups (configurable in one place)
- Modified `createJob()` to initialize board, groups, and dummy applicant
- Added `ensureApplicantsBoard()` - Creates board if it doesn't exist (idempotent)
- Added `ensureDefaultBoardGroups()` - Creates missing default groups (idempotent)
- Added `createDummyApplicant()` - Creates one dummy applicant in "New Applicants" group (idempotent)

**Default Groups Created:**
1. New Applicants (#0073ea - blue)
2. Background Check (#00c875 - green)
3. Interview (#fdab3d - orange)
4. HR Paperwork (#e2445c - red)
5. Hired (#9cd326 - lime)

**Dummy Applicant Data:**
- Name: "Example Applicant"
- Email: "example@applicant.com"
- Phone: "555-555-5555"
- Status: "New"
- Group: "New Applicants"

### 2. `src/components/layout/board-actions.ts` (NEW FILE)
**Server actions for board operations:**
- `renameApplicantsBoard()` - Renames the company's Applicants board
- `duplicateApplicantsBoard()` - Duplicates board configuration (board + columns + status labels, NOT applicants)
- `deleteApplicantsBoard()` - Deletes the board (with cascade to columns, cells, etc.)

**Permissions:**
- All actions check user is authenticated
- All actions verify user has company access
- All actions require admin or non-viewer role (viewers are blocked)

### 3. `src/components/layout/sidebar.tsx`
**Changes:**
- Added `companies` prop to access company slugs
- Added state for `applicantsMenuOpen` and `isPending`
- Added imports for `MoreVertical` icon and board actions
- Added kebab menu button (⋯) that shows on hover next to "Applicants"
- Added dropdown menu with 4 actions:
  - **View application page** - Opens `/apply/{companySlug}/{jobSlug}` in new tab
  - **Rename** - Prompts for new board name
  - **Duplicate** - Duplicates board configuration
  - **Delete** - Deletes board with confirmation
- Implemented handler functions for all actions

### 4. `src/components/layout/app-shell.tsx`
**Changes:**
- Updated `Sidebar` component to receive `companies` prop

---

## Flow Diagrams

### Job Creation Flow
```
User creates job
    ↓
ensureApplicantsBoard()
    → Check if "Applicants" board exists
    → If not, create it
    ↓
ensureDefaultBoardGroups()
    → Get existing groups
    → Create missing groups from DEFAULT_GROUPS
    → Assign colors and sort orders
    ↓
createDummyApplicant()
    → Check if job already has applicants
    → If not, find "New Applicants" group
    → Create dummy applicant with placeholder data
    ↓
Redirect to /dashboard/{companyId}/jobs/{jobId}/applicants
```

### Kebab Menu Flow
```
User clicks ⋯ next to "Applicants"
    ↓
Dropdown shows 4 options
    ↓
┌─────────────────────────────┐
│ View application page       │ → Opens /apply/{slug}/{slug} in new tab
│ Rename                      │ → Prompts for name, updates board
│ Duplicate                   │ → Copies board config, refreshes UI
│ ───────────────────────     │
│ Delete                      │ → Confirms, deletes board, refreshes UI
└─────────────────────────────┘
```

---

## Idempotency & Safety

### Job Creation is Idempotent:
✅ **ensureApplicantsBoard()** - Only creates board if it doesn't exist
✅ **ensureDefaultBoardGroups()** - Only creates missing groups, preserves existing ones
✅ **createDummyApplicant()** - Only creates if job has no applicants yet

### User Permissions:
✅ All board operations check user is authenticated
✅ All operations verify user has company access via account_memberships
✅ Viewers are blocked from all write operations
✅ RLS policies enforce row-level security

### Data Integrity:
✅ Groups are company-level (shared across jobs)
✅ Applicants are job-level (job_id filter)
✅ Dummy applicant is clearly marked as placeholder
✅ Board operations cascade properly (delete removes columns, cells, etc.)

---

## Database Schema Used

### Tables:
- `boards` - Board definitions (company_id, name)
- `board_groups` - Groups within boards (company_id, name, color, sort_order, is_collapsed)
- `board_columns` - Dynamic columns (board_id, company_id, name, type, is_system)
- `board_status_labels` - Labels for status columns (column_id, label, color)
- `board_cells` - Cell values (applicant_id, column_id, value_*)
- `applicants` - Applicant records (company_id, job_id, group_id, position)

### RLS Policies:
No changes needed - existing policies cover:
- Members can view company boards/groups/columns
- Admins can manage boards/groups/columns
- Members can view applicants
- Admins can update/delete applicants

---

## Testing Checklist

### Feature 1: Default Groups + Dummy Applicant
- [ ] Create a new job
- [ ] Verify you're redirected to applicants board
- [ ] Verify 5 default groups are visible
- [ ] Verify groups are in correct order with correct colors
- [ ] Verify "New Applicants" group has exactly 1 dummy row
- [ ] Verify dummy row has placeholder data (Example Applicant, example@applicant.com, etc.)
- [ ] Create another job in the same company
- [ ] Verify groups are NOT duplicated (still only 5 groups)
- [ ] Verify new job gets its own dummy applicant

### Feature 2: Sidebar Kebab Menu
- [ ] Select a job in the sidebar
- [ ] Hover over "Applicants" link
- [ ] Verify ⋯ kebab button appears
- [ ] Click kebab button
- [ ] Verify dropdown shows 4 options
- [ ] **View application page:**
  - [ ] Click action
  - [ ] Verify opens /apply/{companySlug}/{jobSlug} in new tab
  - [ ] Verify public application form loads
- [ ] **Rename:**
  - [ ] Click action
  - [ ] Enter new name
  - [ ] Verify board name updates
- [ ] **Duplicate:**
  - [ ] Click action
  - [ ] Confirm
  - [ ] Verify new board is created with same columns/labels
  - [ ] Verify applicants are NOT duplicated
- [ ] **Delete:**
  - [ ] Click action
  - [ ] Confirm
  - [ ] Verify board is deleted
  - [ ] Verify columns and cells are also removed

### Edge Cases
- [ ] Verify clicking Applicants label (not kebab) navigates to board
- [ ] Verify kebab menu closes when clicking outside
- [ ] Verify operations are disabled during pending state
- [ ] Verify viewers cannot access board operations (if applicable)
- [ ] Verify deleting board doesn't delete applicants (or does cascade as intended)

---

## Known Limitations

1. **Board operations are company-level, not job-level**
   - Each company has one "Applicants" board shared across all jobs
   - Renaming/duplicating/deleting affects all jobs in the company
   - This matches the schema where `boards` and `board_groups` have `company_id`, not `job_id`

2. **Duplicate board doesn't copy applicants**
   - Only copies board structure (columns, labels)
   - Applicants remain in original board
   - This is intentional to avoid data duplication

3. **View application page relies on company.slug and job.slug**
   - Requires company and job slugs to be set correctly
   - Opens in new tab (no inline preview)

4. **Pre-existing TypeScript errors in layout.tsx**
   - Not related to this implementation
   - Caused by incomplete Company type definition
   - Does not affect runtime functionality

---

## Future Enhancements

1. **Job-level boards** - Allow each job to have its own board
2. **Custom default groups** - Allow companies to configure their default groups
3. **Board templates** - Save and reuse board configurations
4. **Inline application preview** - Show application form in modal instead of new tab
5. **Bulk board operations** - Duplicate/delete multiple boards at once
6. **Board versioning** - Track changes to board configuration over time

---

## Deployment Notes

1. **No database migrations needed** - Uses existing schema
2. **No environment variables needed** - Uses existing Supabase config
3. **Backwards compatible** - Works with existing data
4. **Idempotent** - Safe to re-run job creation
5. **No breaking changes** - All changes are additive

---

## Support & Troubleshooting

### Issue: Groups not appearing after job creation
- Check console for errors in `ensureDefaultBoardGroups()`
- Verify RLS policies allow board_groups insert
- Verify user has non-viewer role

### Issue: Dummy applicant not created
- Check if job already has applicants
- Verify "New Applicants" group exists
- Check console for errors in `createDummyApplicant()`

### Issue: Kebab menu not showing
- Verify job is selected in sidebar
- Check if `companies` prop is passed to Sidebar
- Verify MoreVertical icon is imported from lucide-react

### Issue: Board operations fail
- Verify user is authenticated
- Verify user has admin or non-viewer role
- Check RLS policies on boards table
- Verify board exists (check boards table)

---

Generated: 2026-02-14
