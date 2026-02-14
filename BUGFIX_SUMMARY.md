# Bug Fix: Zero Field Values Inserted on Application Submission

## Problem Description

Public job application submissions were sometimes creating an applicant row but inserting **0 rows** into `applicant_field_values`, while still showing "Application Submitted!" success message. This caused applicants to appear in the database but not on the board, as their field values were missing.

## Root Causes Identified

### 1. **Silent Error Swallowing** (PRIMARY BUG)
**Location**: `actions.ts:176-178`

```typescript
// OLD CODE - WRONG ❌
if (valuesError) {
  console.error("Failed to save field values:", valuesError);
  // Don't fail the entire submission if field values fail
}

return { success: true, applicantId: applicant.id }; // Returns success even with 0 values!
```

**Impact**: The function returned `success: true` even when field value insertion failed completely.

### 2. **Overly Aggressive Value Skipping**
**Location**: `actions.ts:147`

```typescript
// OLD CODE - WRONG ❌
for (const field of fields) {
  const value = formData.get(field.key);
  if (!value) continue; // Skips falsy values!

  fieldValues.push(fieldValue);
}
```

**Impact**:
- Unchecked checkboxes (returns `null`) were skipped
- Empty file inputs were skipped
- Any falsy value was skipped, potentially causing 0 values to be built

### 3. **No Validation of Built Array**
**Location**: `actions.ts:170-179`

```typescript
// OLD CODE - WRONG ❌
if (fieldValues.length > 0) {
  const { error: valuesError } = await supabase
    .from("applicant_field_values")
    .insert(fieldValues);
  // ... logs but doesn't fail
}

// No check for fieldValues.length === 0 case!
return { success: true, applicantId: applicant.id };
```

**Impact**: If `fieldValues` was empty, the insert was skipped entirely, but success was still returned.

### 4. **No Logging for Debugging**

The original code had no logging of FormData entries or field values being built, making it impossible to debug why some submissions had 0 values.

## Solutions Implemented

### 1. **Comprehensive Logging**

Added detailed logging at every critical step:

```typescript
// Log FormData (with sensitive value masking)
console.log('[Application Submit] FormData entries:', formDataEntries);

// Log fields loaded
console.log('[Application Submit] Fields loaded:', {
  count: fields.length,
  fieldKeys: fields.map(f => ({ key: f.key, type: f.type, required: f.required }))
});

// Log field values being built
console.log('[Application Submit] Field values to insert:', {
  count: fieldValues.length,
  values: fieldValues.map(v => ({ field_id: v.field_id, hasText: !!v.value_text, ... }))
});

// Log final result
console.log('[Application Submit] Field values inserted:', insertedCount);
```

### 2. **Fail-Fast Validation**

Added validation that fails the submission if no values can be inserted:

```typescript
// NEW CODE - CORRECT ✅
if (fieldValues.length === 0) {
  console.error('[Application Submit] CRITICAL: No field values to insert!');
  // Rollback applicant creation
  await supabase.from("applicants").delete().eq("id", applicant.id);
  return {
    error: "Application submission failed: No form data received. Please fill out the form and try again."
  };
}
```

### 3. **Defensive Field Value Building**

Each field type now has explicit handling with proper fallbacks:

```typescript
// NEW CODE - CORRECT ✅
if (field.type === "checkbox") {
  // Always save checkbox state (true or false)
  fieldValue.value_bool = value === "on" || value === "true";
  fieldValues.push(fieldValue);
} else if (field.type === "file") {
  // File field: save the storage path
  if (resumePath) {
    fieldValue.value_file_path = resumePath;
    fieldValues.push(fieldValue);
  } else if (field.required) {
    // Fail if required file is missing
    await supabase.from("applicants").delete().eq("id", applicant.id);
    return { error: `${field.label} is required` };
  }
  // Optional files with no upload are not saved
} else {
  // Text fields: only save if value exists and is non-empty
  if (value && typeof value === 'string' && value.trim()) {
    fieldValue.value_text = value;
    fieldValues.push(fieldValue);
  } else if (field.required) {
    await supabase.from("applicants").delete().eq("id", applicant.id);
    return { error: `${field.label} is required` };
  }
}
```

### 4. **Insert Verification with Rollback**

```typescript
// NEW CODE - CORRECT ✅
const { data: insertedValues, error: valuesError } = await supabase
  .from("applicant_field_values")
  .insert(fieldValues)
  .select();

if (valuesError) {
  console.error('[Application Submit] CRITICAL: Failed to save field values:', valuesError);
  // Rollback applicant creation
  await supabase.from("applicants").delete().eq("id", applicant.id);
  return {
    error: "Failed to save application data. Please try again or contact support."
  };
}

// Verify that we actually inserted rows
const insertedCount = insertedValues?.length || 0;
console.log('[Application Submit] Field values inserted:', insertedCount);

if (insertedCount === 0) {
  console.error('[Application Submit] CRITICAL: Insert returned 0 rows!');
  // Rollback applicant creation
  await supabase.from("applicants").delete().eq("id", applicant.id);
  return {
    error: "Failed to save application data. Please try again or contact support."
  };
}
```

### 5. **Improved File Upload with Helper**

Created dedicated `uploadResume()` helper with validation:

```typescript
// NEW CODE - CORRECT ✅
const uploadResult = await uploadResume(
  supabase,
  resumeFile,
  form.company_id,
  jobId
);

if (!uploadResult.success) {
  console.error('[Application Submit] Resume upload failed:', uploadResult.error);
  return { error: uploadResult.error || "Failed to upload resume. Please try again." };
}

resumePath = uploadResult.path!;
```

Features:
- File size validation (10MB max)
- File type validation (PDF, DOC, DOCX only)
- Sanitized file names
- Proper error messages

### 6. **Client-Side Validation**

Enhanced the form component with client-side validation:

```typescript
// Client-side validation for required fields
const requiredFields = fields.filter(f => f.required);
for (const field of requiredFields) {
  const value = formData.get(field.key);

  if (field.type === 'file') {
    if (!value || !(value instanceof File) || value.size === 0) {
      setError(`${field.label} is required`);
      setIsSubmitting(false);
      return;
    }
  } else if (!value || (typeof value === 'string' && !value.trim())) {
    setError(`${field.label} is required`);
    setIsSubmitting(false);
    return;
  }
}
```

### 7. **Better Accessibility**

Added proper form accessibility:
- `htmlFor` attributes on all labels
- `id` attributes on all inputs
- Proper label associations for radio buttons

## Files Changed

### 1. `/src/app/apply/[jobId]/[token]/actions.ts`
- Added comprehensive logging
- Fixed error handling to fail loudly
- Added rollback logic for failed submissions
- Improved field value building logic
- Added validation that fieldValues.length > 0
- Integrated resume upload helper

### 2. `/src/app/apply/[jobId]/[token]/PublicApplicationForm.tsx`
- Added client-side validation
- Added better error messages
- Improved accessibility (id/htmlFor attributes)
- Added file size hint for file inputs
- Added console logging for debugging

### 3. `/src/lib/storage/resumeUpload.ts` (NEW FILE)
- Reusable resume upload helper
- File size validation (10MB max)
- File type validation
- Proper error handling
- File name sanitization

## Testing Checklist

### Before Production Deployment:

1. **Test Normal Submission**
   - [ ] Fill all required fields
   - [ ] Submit form
   - [ ] Verify applicant appears on board
   - [ ] Verify all field values are saved in DB
   - [ ] Check server logs for success messages

2. **Test File Upload**
   - [ ] Upload PDF resume
   - [ ] Upload DOC/DOCX resume
   - [ ] Verify file appears in Supabase Storage
   - [ ] Verify file path saved in applicant_field_values
   - [ ] Try uploading file > 10MB (should fail with clear error)
   - [ ] Try uploading invalid file type (should fail with clear error)

3. **Test Required Field Validation**
   - [ ] Skip a required text field (should show error)
   - [ ] Skip required file upload (should show error)
   - [ ] Submit with missing required checkbox (should show error)
   - [ ] Verify NO applicant row is created on validation failure

4. **Test Optional Fields**
   - [ ] Leave optional text field empty
   - [ ] Don't upload optional file
   - [ ] Uncheck optional checkbox
   - [ ] Verify submission succeeds
   - [ ] Verify only filled fields have values in DB

5. **Test Error Cases**
   - [ ] Simulate DB error (check rollback works)
   - [ ] Simulate storage error (check applicant not created)
   - [ ] Check all error messages are user-friendly

6. **Verify Logging**
   - [ ] Check server logs show FormData entries
   - [ ] Check logs show field count
   - [ ] Check logs show inserted value count
   - [ ] Verify sensitive fields are masked

## Expected Behavior After Fix

✅ **Success Case**:
- Applicant row created
- At least 1 (typically all filled) field values inserted
- User sees success message
- Applicant appears on board

❌ **Failure Cases** (should show error, NOT success):
- Missing required field → Error shown, no DB writes
- File upload fails → Error shown, no applicant created
- Field value insert fails → Error shown, applicant row rolled back
- 0 field values built → Error shown, applicant row rolled back

## Monitoring Recommendations

1. **Add alert** for any `[Application Submit] CRITICAL` logs
2. **Track metric**: Ratio of applicants with 0 values (should be 0%)
3. **Track metric**: Average values per applicant (should match form field count)
4. **Monitor**: Resume upload failures

## Database Query to Check for Zero-Value Applicants

```sql
-- Find applicants with zero field values
SELECT
  a.id,
  a.full_name,
  a.email,
  a.created_at,
  COUNT(afv.id) as value_count
FROM applicants a
LEFT JOIN applicant_field_values afv ON afv.applicant_id = a.id
WHERE a.created_at > NOW() - INTERVAL '7 days'
GROUP BY a.id, a.full_name, a.email, a.created_at
HAVING COUNT(afv.id) = 0
ORDER BY a.created_at DESC;
```

## Rollout Plan

1. **Deploy to staging**
2. **Run full test suite** (see Testing Checklist above)
3. **Monitor logs** for any issues
4. **Test with real form** (all field types)
5. **Deploy to production**
6. **Monitor for 24h** for any new issues
7. **Run zero-value query** to confirm no new cases

---

**Date**: 2026-02-14
**Severity**: Critical
**Status**: Fixed ✅
