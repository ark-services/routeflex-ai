"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { uploadResume } from "@/lib/storage/resumeUpload";
import { getOrCreateApplicantsBoard } from "@/lib/boards/getOrCreateApplicantsBoard";
import { revalidatePath } from "next/cache";
import { fireJobTrigger } from "@/lib/automations/fireJobAutomation";

/**
 * Submit a public job application.
 * This uses the service role to bypass RLS safely on the server.
 */
export async function submitApplication(
  jobId: string,
  token: string,
  formData: FormData
) {
  // Create service role client (bypasses RLS)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Log FormData entries for debugging (mask sensitive values)
  const formDataEntries = Array.from(formData.entries()).map(([key, value]) => {
    if (key.toLowerCase().includes('password') || key.toLowerCase().includes('ssn')) {
      return [key, '[REDACTED]'];
    }
    if (value instanceof File) {
      return [key, `File: ${value.name} (${value.size} bytes)`];
    }
    return [key, typeof value === 'string' ? value.substring(0, 100) : value];
  });
  console.log('[Application Submit] FormData entries:', formDataEntries);

  // Validate token and get form details using the helper function
  const { data: formDetails, error: formError } = await supabase.rpc(
    "get_public_form_by_token",
    { token }
  );

  if (formError || !formDetails || formDetails.length === 0) {
    console.error('[Application Submit] Invalid token:', { token, formError });
    return { error: "Invalid application form link" };
  }

  const form = formDetails[0];
  console.log('[Application Submit] Form loaded:', {
    formId: form.form_id,
    jobId: form.job_id,
    companyId: form.company_id
  });

  // Get form fields using the helper function
  const { data: fieldsData, error: fieldsError } = await supabase.rpc(
    "get_public_form_fields_by_token",
    { token }
  );

  if (fieldsError || !fieldsData) {
    console.error('[Application Submit] Failed to load fields:', fieldsError);
    return { error: "Failed to load form fields" };
  }

  const fields = fieldsData;
  console.log('[Application Submit] Fields loaded:', {
    count: fields.length,
    fieldKeys: fields.map((f: any) => ({ key: f.key, type: f.type, required: f.required }))
  });

  // Validate required fields
  for (const field of fields) {
    if (field.required) {
      const value = formData.get(field.key);

      // Special handling for file fields
      if (field.type === 'file') {
        if (!value || !(value instanceof File) || value.size === 0) {
          console.error('[Application Submit] Required file missing:', field.key);
          return { error: `${field.label} is required` };
        }
      } else {
        // For non-file fields
        if (!value || (typeof value === "string" && !value.trim())) {
          console.error('[Application Submit] Required field missing:', field.key);
          return { error: `${field.label} is required` };
        }
      }
    }
  }

  try {
    // Get or create the board and groups (self-healing)
    console.log('[Application Submit] Getting or creating board for job:', jobId);
    const boardResult = await getOrCreateApplicantsBoard(
      supabase,
      form.company_id,
      jobId
    );

    if (!boardResult.success) {
      console.error('[Application Submit] Failed to get/create board:', boardResult.error);
      return { error: boardResult.error || "Failed to setup application board" };
    }

    const board = boardResult.board;
    const groups = boardResult.groups;

    // ── Determine the destination group (robust fallback chain) ──────────────
    // destinationGroup is explicitly nullable here because we try up to four
    // strategies before settling on a real group (or auto-creating one).
    // It MUST be non-null before we proceed to insert the applicant — the
    // guard below line 4 ensures that invariant and gives TS a single,
    // unambiguous narrowing point.
    //
    // Priority:
    //   1. Group flagged is_default_for_applications = true  (explicit, preferred)
    //   2. Name match against known intake group names       (legacy / renamed)
    //   3. First group by sort_order                         (anything is better than failing)
    //   4. Auto-create "New Applicants"                      (all groups were deleted)
    const INTAKE_NAMES = new Set([
      "new applicants", "new group", "inbox", "applied", "applicants",
    ]);

    // Explicitly typed as BoardGroup | null so later assignments (from
    // .maybeSingle() or .single()) are accepted without narrowing conflicts.
    let destinationGroup: BoardGroup | null =
      groups.find((g) => g.is_default_for_applications) ??
      groups.find((g) => INTAKE_NAMES.has(g.name.toLowerCase().trim())) ??
      groups[0] ??   // already ordered by sort_order ascending
      null;

    if (!destinationGroup) {
      // All groups were deleted from this board — create one now.
      console.warn('[Application Submit] No groups found on board, auto-creating default group', {
        event: "application.group.autocreated",
        job_id: jobId,
        company_id: form.company_id,
        board_id: board.id,
      });

      const { data: newGroup, error: createGroupErr } = await supabase
        .from("board_groups")
        .insert({
          board_id: board.id,
          company_id: form.company_id,
          name: "New Applicants",
          color: "#0073ea",
          sort_order: 1,
          is_default_for_applications: true,
        })
        .select("id, name, sort_order, color, is_collapsed, is_default_for_applications")
        .single();

      if (createGroupErr || !newGroup) {
        // Creation failed (e.g. concurrent request already inserted one) —
        // try fetching whatever group now exists for this board.
        const { data: fallbackGroup, error: fallbackErr } = await supabase
          .from("board_groups")
          .select("id, name, sort_order, color, is_collapsed, is_default_for_applications")
          .eq("board_id", board.id)
          .eq("company_id", form.company_id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (fallbackErr) {
          console.error('[Application Submit] Fallback group fetch failed:', fallbackErr);
        }
        // fallbackGroup is null when no rows exist; that case is caught below.
        destinationGroup = fallbackGroup as BoardGroup | null;
      } else {
        destinationGroup = newGroup as BoardGroup;
        console.log('[Application Submit] Auto-created default group:', newGroup.id);
      }
    }

    // Final guard: after all four strategies, destinationGroup must be set.
    // If it is still null here, the DB is in an unrecoverable state for this
    // request — return a safe user-facing message without leaking internals.
    if (!destinationGroup) {
      const debugId = `grp-${Date.now().toString(36)}`;
      console.error('[Application Submit] CRITICAL: could not create or find any group. debugId:', debugId);
      return { error: "We couldn't submit your application. Please try again." };
    }

    console.log('[Application Submit] Using board:', board.id, 'group:', destinationGroup.id, `"${destinationGroup.name}"`);

    // Handle resume upload if present
    let resumePath: string | null = null;
    const resumeField = fields.find((f: any) => f.type === "file" && f.key === "resume");

    if (resumeField) {
      const resumeFile = formData.get("resume");

      if (resumeFile && resumeFile instanceof File && resumeFile.size > 0) {
        console.log('[Application Submit] Processing resume upload');

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
        console.log('[Application Submit] Resume uploaded successfully:', resumePath);
      } else if (resumeField.required) {
        console.error('[Application Submit] Required resume missing');
        return { error: `${resumeField.label} is required` };
      }
    }

    // Build applicant name from first_name and last_name or fallback
    const firstName = formData.get("first_name") as string | null;
    const lastName = formData.get("last_name") as string | null;
    const fullName = firstName && lastName
      ? `${firstName} ${lastName}`.trim()
      : firstName || lastName || "Applicant";

    // Get email and phone from form data
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;

    console.log('[Application Submit] Creating applicant:', { fullName, email, phone });

    // Get next position for this group
    const { data: maxPositionData } = await supabase
      .from("applicants")
      .select("position")
      .eq("group_id", destinationGroup.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPosition = maxPositionData ? maxPositionData.position + 1 : 0;

    // Create the applicant
    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .insert({
        company_id: form.company_id,
        job_id: jobId,
        board_id: board.id,
        group_id: destinationGroup.id,
        full_name: fullName,
        email: email || "",
        phone: phone || "",
        status: "applied",
        position: nextPosition,
        resume_path: resumePath,
      })
      .select()
      .single();

    if (applicantError) {
      console.error('[Application Submit] Failed to create applicant:', applicantError);
      return { error: "Failed to submit application. Please try again." };
    }

    console.log('[Application Submit] Applicant created:', applicant.id);

    // Save field values - build key->id mapping for accurate field resolution
    const fieldKeyToId = new Map<string, string>();
    fields.forEach((field: any) => {
      fieldKeyToId.set(field.key, field.field_id);
    });

    const fieldValues = [];

    for (const field of fields) {
      const value = formData.get(field.key);

      const fieldValue: any = {
        applicant_id: applicant.id,
        field_id: field.field_id, // Use field_id from RPC result
      };

      // Map value to appropriate column based on field type
      if (field.type === "number") {
        const numValue = value ? parseFloat(value as string) : null;
        if (numValue !== null && !isNaN(numValue)) {
          fieldValue.value_number = numValue;
          fieldValues.push(fieldValue);
        } else if (field.required) {
          console.error('[Application Submit] Required number field missing or invalid:', field.key);
          // Rollback applicant creation
          await supabase.from("applicants").delete().eq("id", applicant.id);
          return { error: `${field.label} must be a valid number` };
        }
      } else if (field.type === "date") {
        if (value && typeof value === 'string' && value.trim()) {
          fieldValue.value_date = value;
          fieldValues.push(fieldValue);
        } else if (field.required) {
          console.error('[Application Submit] Required date field missing:', field.key);
          await supabase.from("applicants").delete().eq("id", applicant.id);
          return { error: `${field.label} is required` };
        }
      } else if (field.type === "checkbox") {
        // Checkboxes: checked = "on", unchecked = null
        // Always save checkbox state (true or false)
        fieldValue.value_bool = value === "on" || value === "true";
        fieldValues.push(fieldValue);
      } else if (field.type === "file") {
        // File field: save the storage path
        if (resumePath) {
          fieldValue.value_file_path = resumePath;
          fieldValues.push(fieldValue);
        } else if (field.required) {
          console.error('[Application Submit] Required file missing:', field.key);
          await supabase.from("applicants").delete().eq("id", applicant.id);
          return { error: `${field.label} is required` };
        }
        // If optional and no file, don't add a value row
      } else {
        // Text, email, phone, textarea, select, radio, etc.
        if (value && typeof value === 'string' && value.trim()) {
          fieldValue.value_text = value;
          fieldValues.push(fieldValue);
        } else if (field.required) {
          console.error('[Application Submit] Required text field missing:', field.key);
          await supabase.from("applicants").delete().eq("id", applicant.id);
          return { error: `${field.label} is required` };
        }
        // Optional fields with no value are not saved
      }
    }

    console.log('[Application Submit] Field values to insert:', {
      count: fieldValues.length,
      values: fieldValues.map(v => ({
        field_id: v.field_id,
        hasText: !!v.value_text,
        hasNumber: !!v.value_number,
        hasDate: !!v.value_date,
        hasBool: v.value_bool !== undefined,
        hasFile: !!v.value_file_path
      }))
    });

    // CRITICAL: Ensure we have at least one field value to insert
    if (fieldValues.length === 0) {
      console.error('[Application Submit] CRITICAL: No field values to insert!');
      // Rollback applicant creation
      await supabase.from("applicants").delete().eq("id", applicant.id);
      return {
        error: "Application submission failed: No form data received. Please fill out the form and try again."
      };
    }

    // Insert field values
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

    console.log('[Application Submit] SUCCESS:', {
      applicantId: applicant.id,
      fieldsInserted: insertedCount,
      companyId: form.company_id,
      jobId: jobId,
    });

    // Fire automation trigger: form.submitted and applicant.created
    try {
      // Fire form.submitted trigger
      await fireJobTrigger(supabase, {
        companyId: form.company_id,
        jobId: jobId,
        trigger_key: "form.submitted",
        subject_type: "applicant",
        subject_id: applicant.id,
        payload: {
          company_id: form.company_id,
          job_id: jobId,
          board_id: board.id,
          applicant_id: applicant.id,
          form_id: form.form_id,
          group_id: destinationGroup.id,
        },
      });

      // Fire applicant.created trigger
      await fireJobTrigger(supabase, {
        companyId: form.company_id,
        jobId: jobId,
        trigger_key: "applicant.created",
        subject_type: "applicant",
        subject_id: applicant.id,
        payload: {
          company_id: form.company_id,
          job_id: jobId,
          board_id: board.id,
          applicant_id: applicant.id,
          group_id: destinationGroup.id,
        },
      });

      console.log('[Application Submit] Triggered form.submitted and applicant.created automations');
    } catch (triggerError) {
      console.error('[Application Submit] Trigger error (non-fatal):', triggerError);
    }

    // Revalidate the applicants board page so new applicant shows immediately
    try {
      revalidatePath(`/dashboard/${form.company_id}/jobs/${jobId}/applicants`);
      console.log('[Application Submit] Revalidated applicants board path');
    } catch (revalError) {
      console.error('[Application Submit] Revalidation error (non-fatal):', revalError);
    }

    return { success: true, applicantId: applicant.id };
  } catch (error) {
    console.error('[Application Submit] Unexpected error:', error);
    return { error: "An unexpected error occurred. Please try again." };
  }
}
