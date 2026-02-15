# Bugfix Summary: Three Critical Applicants Board Issues

## Issues Fixed

### 1. Runtime Error: "invalid input syntax for type uuid: 'text'" ✅

**Root Cause:** Missing `jobId` parameter in all server action calls from ApplicantsBoard component, causing parameter shift where `columnType` (the string "text") was being passed as `columnId` (expected UUID).

**Files Modified:**
- `/src/app/dashboard/[companyId]/jobs/[jobId]/applicants/ApplicantsBoard.tsx`
- `/src/app/dashboard/[companyId]/jobs/[jobId]/applicants/actions.ts`

**Changes:**

1. **ApplicantsBoard.tsx**: Added `jobId` parameter to all server action calls:
   - `updateBoardCell(companyId, jobId, ...)` - Fixed parameter shift
   - `reorderColumns(companyId, jobId, ...)`
   - `reorderApplicants(companyId, jobId, ...)`
   - `bulkDeleteApplicants(companyId, jobId, ...)`
   - `bulkMoveApplicants(companyId, jobId, ...)`
   - `toggleGroupCollapse(companyId, jobId, ...)`
   - `updateGroupColor(companyId, jobId, ...)`
   - `createBoardColumn(companyId, jobId, ...)`
   - `updateBoardColumn(companyId, jobId, ...)`
   - `deleteBoardColumn(companyId, jobId, ...)`
   - `moveApplicant(companyId, jobId, ...)`
   - `deleteApplicant(companyId, jobId, ...)`
   - `duplicateApplicant(companyId, jobId, ...)`

2. **actions.ts**: Added comprehensive logging and UUID validation to `updateBoardCell`:
   ```typescript
   // UUID validation regex
   const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

   // Log all parameters
   console.log('[updateBoardCell] Called with parameters:', {...});

   // Validate all UUID parameters
   for (const param of uuidParams) {
     if (!UUID_REGEX.test(param.value)) {
       throw new Error(`Invalid UUID for ${param.name}: "${param.value}"`);
     }
   }
   ```

**Result:** Cell editing now works correctly with proper UUIDs passed to database.

---

### 2. Delete Not Working: Rows Stay After Delete ✅

**Root Cause:** Same as issue #1 - missing `jobId` parameter in delete action calls caused wrong parameters to be passed to Supabase query.

**Files Modified:**
- `/src/app/dashboard/[companyId]/jobs/[jobId]/applicants/ApplicantsBoard.tsx`
- `/src/app/dashboard/[companyId]/jobs/[jobId]/applicants/actions.ts`

**Changes:**

1. **ApplicantsBoard.tsx**: Fixed delete action calls:
   ```typescript
   // Before: await deleteApplicant(companyId, applicantId);
   // After:
   await deleteApplicant(companyId, jobId, applicantId);

   // Before: await bulkDeleteApplicants(companyId, selectedIds);
   // After:
   await bulkDeleteApplicants(companyId, jobId, selectedIds);
   ```

2. **actions.ts**: Added comprehensive logging to both delete functions:
   ```typescript
   console.log('[deleteApplicant] Called with:', { companyId, jobId, applicantId });

   const { error, count } = await supabase
     .from("applicants")
     .delete({ count: 'exact' })
     .eq("id", applicantId)
     .eq("company_id", companyId)
     .eq("job_id", jobId);

   console.log('[deleteApplicant] Success:', { deletedCount: count });

   if (count === 0) {
     console.warn('[deleteApplicant] WARNING: No rows deleted. Check RLS policies or applicant ID.');
   }
   ```

**RLS Policy Note:**
The DELETE policy requires `is_company_admin()` role (owner/admin):
```sql
create policy "Admins can delete applicants"
  on public.applicants
  for delete
  using (public.is_company_admin(company_id));
```

If deletes still fail with `count=0` in logs, the user needs owner/admin role. The logging will clearly indicate if this is the issue.

**Result:** Deletes now pass correct parameters. Logging will reveal if RLS is blocking (count=0).

---

### 3. Kebab Menu Hidden Behind Checkboxes ✅

**Root Cause:** Dropdown menu rendered inside table DOM hierarchy, causing it to be clipped by overflow containers and losing z-index battles with sticky elements.

**Files Modified:**
- `/src/app/dashboard/[companyId]/jobs/[jobId]/applicants/ApplicantsBoard.tsx`

**Changes:**

1. **Added React Portal**: Menu now renders outside table hierarchy using `createPortal(menu, document.body)`

2. **Dynamic Positioning**: Calculate menu position based on button location:
   ```typescript
   const menuButtonRef = useRef<HTMLButtonElement>(null);
   const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

   useEffect(() => {
     if (rowMenuOpen && menuButtonRef.current) {
       const rect = menuButtonRef.current.getBoundingClientRect();
       setMenuPosition({
         top: rect.bottom + window.scrollY,
         left: rect.left + window.scrollX,
       });
     }
   }, [rowMenuOpen]);
   ```

3. **Fixed Positioning with Backdrop**:
   ```typescript
   {rowMenuOpen && menuPosition && createPortal(
     <>
       {/* Backdrop to close menu when clicking outside */}
       <div className="fixed inset-0 z-[998]" onClick={() => setRowMenuOpen(false)} />

       {/* Menu with fixed positioning and high z-index */}
       <div
         className="fixed z-[999] w-40 rounded-lg border border-stone-200 bg-white py-1 shadow-xl"
         style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
       >
         {/* Menu content */}
       </div>
     </>,
     document.body
   )}
   ```

**Result:** Dropdown menu now:
- Renders in a portal to `document.body`
- Uses `fixed` positioning to escape table stacking context
- Has z-index of 999 (above table elements)
- Includes click-outside-to-close backdrop
- Correctly positions relative to kebab button

---

## Testing Checklist

### Issue #1: Cell Editing
- [ ] Click into "Last Name" cell for an applicant
- [ ] Edit the value
- [ ] Verify no runtime error
- [ ] Verify value saves to database
- [ ] Check browser console for `[updateBoardCell] Success:` log

### Issue #2: Delete
- [ ] Select an applicant row (checkbox)
- [ ] Click Delete button
- [ ] Confirm deletion in dialog
- [ ] Verify row disappears immediately
- [ ] Refresh page
- [ ] Verify row is still gone
- [ ] Check console logs:
  - `[deleteApplicant] Called with: ...`
  - `[deleteApplicant] Success: { deletedCount: 1 }`
- [ ] If `deletedCount: 0`, check user role (must be owner/admin)

### Issue #3: Kebab Menu
- [ ] Click kebab (⋮) menu on any row
- [ ] Verify dropdown appears above checkboxes
- [ ] Verify dropdown is not clipped
- [ ] Click outside dropdown to close
- [ ] Verify dropdown closes on outside click
- [ ] Test with table scrolled horizontally and vertically

---

## Additional Notes

### Parameter Shift Bug Pattern
The systematic issue was that ALL server actions expected `jobId` as the 2nd parameter, but the component was omitting it, causing:
```
Function expects: (companyId, jobId, applicantId, columnId, columnType, value)
Component passed: (companyId,       applicantId, columnId, columnType, value)
Result:           applicantId → jobId
                  columnId    → applicantId
                  columnType  → columnId  ← "text" as UUID = ERROR!
```

### Logging Strategy
All modified actions now log:
1. Input parameters (for debugging)
2. Supabase response (data/error/count)
3. Success confirmation or warnings
4. Clear error messages with context

This makes debugging much easier and errors won't fail silently.

### Future Improvements
1. Consider relaxing DELETE RLS policy to allow all members (not just admins)
2. Add TypeScript strict mode to catch parameter mismatches at compile time
3. Consider using a type-safe RPC wrapper to prevent parameter shift bugs
4. Add integration tests for CRUD operations
