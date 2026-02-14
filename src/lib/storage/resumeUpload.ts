import { SupabaseClient } from "@supabase/supabase-js";

export type ResumeUploadResult = {
  success: boolean;
  path?: string;
  error?: string;
};

/**
 * Upload a resume file to Supabase Storage
 * @param supabase - Supabase client (service role for server-side)
 * @param file - File to upload
 * @param companyId - Company ID for organizing files
 * @param jobId - Job ID for organizing files
 * @returns Upload result with path or error
 */
export async function uploadResume(
  supabase: SupabaseClient,
  file: File,
  companyId: string,
  jobId: string
): Promise<ResumeUploadResult> {
  // Validate file
  if (!file || file.size === 0) {
    return {
      success: false,
      error: "No file provided or file is empty"
    };
  }

  // Validate file size (10MB max)
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: "File size exceeds 10MB limit"
    };
  }

  // Validate file type
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  if (!allowedTypes.includes(file.type)) {
    return {
      success: false,
      error: "Invalid file type. Only PDF and Word documents are allowed."
    };
  }

  try {
    // Generate unique file name
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${companyId}/${jobId}/${timestamp}-${sanitizedFileName}`;

    console.log('[Resume Upload] Uploading file:', {
      originalName: file.name,
      storagePath: fileName,
      size: file.size,
      type: file.type
    });

    // Upload to Supabase Storage
    const { data, error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('[Resume Upload] Upload failed:', uploadError);
      return {
        success: false,
        error: uploadError.message || "Failed to upload file"
      };
    }

    console.log('[Resume Upload] Upload successful:', fileName);

    return {
      success: true,
      path: fileName
    };
  } catch (error) {
    console.error('[Resume Upload] Unexpected error:', error);
    return {
      success: false,
      error: "An unexpected error occurred during file upload"
    };
  }
}

/**
 * Get public URL for a resume file
 * @param supabase - Supabase client
 * @param path - Storage path
 * @returns Public URL
 */
export function getResumePublicUrl(supabase: SupabaseClient, path: string): string {
  const { data } = supabase.storage
    .from("resumes")
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Delete a resume file from storage
 * @param supabase - Supabase client (service role)
 * @param path - Storage path
 * @returns Success status
 */
export async function deleteResume(
  supabase: SupabaseClient,
  path: string
): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from("resumes")
      .remove([path]);

    if (error) {
      console.error('[Resume Delete] Failed to delete:', error);
      return false;
    }

    console.log('[Resume Delete] Successfully deleted:', path);
    return true;
  } catch (error) {
    console.error('[Resume Delete] Unexpected error:', error);
    return false;
  }
}
