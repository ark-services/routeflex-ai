"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { uploadResume } from "@/lib/storage/resumeUpload";
import { getOrCreateApplicantsBoard } from "@/lib/boards/getOrCreateApplicantsBoard";

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

    // Find the "New Applicants" group
    const newApplicantsGroup = groups.find(g => g.name === "New Applicants");
    if (!newApplicantsGroup) {
      console.error('[Application Submit] New Applicants group not found in groups:', groups);
      return { error: "Default application group not found" };
    }

    console.log('[Application Submit] Using board:', board.id, 'group:', newApplicantsGroup.id);

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
      .eq("group_id", newApplicantsGroup.id)
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
        group_id: newApplicantsGroup.id,
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
      fieldsInserted: insertedCount
    });

    return { success: true, applicantId: applicant.id };
  } catch (error) {
    console.error('[Application Submit] Unexpected error:', error);
    return { error: "An unexpected error occurred. Please try again." };
  }
}
