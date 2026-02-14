"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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

  // Validate token and get form details using the helper function
  const { data: formDetails, error: formError } = await supabase.rpc(
    "get_public_form_by_token",
    { token }
  );

  if (formError || !formDetails || formDetails.length === 0) {
    return { error: "Invalid application form link" };
  }

  const form = formDetails[0];

  // Get form fields using the helper function
  const { data: fieldsData, error: fieldsError } = await supabase.rpc(
    "get_public_form_fields_by_token",
    { token }
  );

  if (fieldsError || !fieldsData) {
    return { error: "Failed to load form fields" };
  }

  const fields = fieldsData;

  // Validate required fields
  for (const field of fields) {
    if (field.required) {
      const value = formData.get(field.key);
      if (!value || (typeof value === "string" && !value.trim())) {
        return { error: `${field.label} is required` };
      }
    }
  }

  try {
    // Get the board for this job
    const { data: board } = await supabase
      .from("boards")
      .select("id")
      .eq("job_id", jobId)
      .eq("name", "Applicants")
      .single();

    if (!board) {
      return { error: "Application board not found" };
    }

    // Get the "New Applicants" group
    const { data: group } = await supabase
      .from("board_groups")
      .select("id")
      .eq("board_id", board.id)
      .eq("name", "New Applicants")
      .single();

    if (!group) {
      return { error: "Default group not found" };
    }

    // Handle resume upload if present
    let resumePath: string | null = null;
    const resumeField = fields.find((f: any) => f.type === "file" && f.key === "resume");
    if (resumeField) {
      const resumeFile = formData.get("resume") as File | null;
      if (resumeFile && resumeFile.size > 0) {
        // Upload to Supabase Storage
        const fileName = `${form.company_id}/${jobId}/${Date.now()}-${resumeFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(fileName, resumeFile);

        if (uploadError) {
          console.error("Resume upload failed:", uploadError);
          return { error: "Failed to upload resume" };
        }

        resumePath = fileName;
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

    // Create the applicant
    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .insert({
        company_id: form.company_id,
        job_id: jobId,
        board_id: board.id,
        group_id: group.id,
        full_name: fullName,
        email: email || "",
        phone: phone || "",
        status: "applied",
        position: 0, // Will be auto-incremented by other applicants
        resume_path: resumePath,
      })
      .select()
      .single();

    if (applicantError) {
      console.error("Failed to create applicant:", applicantError);
      return { error: "Failed to submit application" };
    }

    // Save field values
    const fieldValues = [];
    for (const field of fields) {
      const value = formData.get(field.key);
      if (!value) continue;

      const fieldValue: any = {
        applicant_id: applicant.id,
        field_id: field.field_id,
      };

      // Map value to appropriate column based on field type
      if (field.type === "number") {
        fieldValue.value_number = parseFloat(value as string);
      } else if (field.type === "date") {
        fieldValue.value_date = value as string;
      } else if (field.type === "checkbox") {
        fieldValue.value_bool = value === "on" || value === "true";
      } else if (field.type === "file") {
        fieldValue.value_file_path = resumePath;
      } else {
        fieldValue.value_text = value as string;
      }

      fieldValues.push(fieldValue);
    }

    if (fieldValues.length > 0) {
      const { error: valuesError } = await supabase
        .from("applicant_field_values")
        .insert(fieldValues);

      if (valuesError) {
        console.error("Failed to save field values:", valuesError);
        // Don't fail the entire submission if field values fail
      }
    }

    return { success: true, applicantId: applicant.id };
  } catch (error) {
    console.error("Application submission error:", error);
    return { error: "An unexpected error occurred" };
  }
}
