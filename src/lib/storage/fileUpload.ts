import { SupabaseClient } from "@supabase/supabase-js";

export type FileUploadResult = {
  success: boolean;
  path?: string;
  url?: string;
  metadata?: {
    name: string;
    size: number;
    type: string;
  };
  error?: string;
};

/**
 * Upload a file to Supabase Storage for board columns
 * @param supabase - Supabase client (service role for server-side)
 * @param file - File to upload
 * @param companyId - Company ID for organizing files
 * @param boardId - Board ID for organizing files
 * @param columnId - Column ID for organizing files
 * @returns Upload result with path, URL, metadata, or error
 */
export async function uploadBoardFile(
  supabase: SupabaseClient,
  file: File,
  companyId: string,
  boardId: string,
  columnId: string
): Promise<FileUploadResult> {
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

  // Validate file type - allow common document, spreadsheet, image, and text files
  const allowedTypes = [
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Spreadsheets
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    // Images
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    // Text
    "text/plain",
    "text/html",
    "application/json"
  ];

  if (!allowedTypes.includes(file.type)) {
    return {
      success: false,
      error: "Invalid file type. Allowed types: PDF, Word, Excel, CSV, images (JPEG, PNG, GIF, WebP), and text files."
    };
  }

  try {
    // Generate unique file name with timestamp
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${companyId}/${boardId}/${columnId}/${timestamp}-${sanitizedFileName}`;

    console.log('[Board File Upload] Uploading file:', {
      originalName: file.name,
      storagePath: filePath,
      size: file.size,
      type: file.type
    });

    // Upload to Supabase Storage
    const { data, error: uploadError } = await supabase.storage
      .from("files")
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('[Board File Upload] Upload failed:', uploadError);
      return {
        success: false,
        error: uploadError.message || "Failed to upload file"
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("files")
      .getPublicUrl(filePath);

    console.log('[Board File Upload] Upload successful:', filePath);

    return {
      success: true,
      path: filePath,
      url: urlData.publicUrl,
      metadata: {
        name: file.name,
        size: file.size,
        type: file.type
      }
    };
  } catch (error) {
    console.error('[Board File Upload] Unexpected error:', error);
    return {
      success: false,
      error: "An unexpected error occurred during file upload"
    };
  }
}

/**
 * Get public URL for a board file
 * @param supabase - Supabase client
 * @param path - Storage path
 * @returns Public URL
 */
export function getBoardFilePublicUrl(supabase: SupabaseClient, path: string): string {
  const { data } = supabase.storage
    .from("files")
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Delete a board file from storage
 * @param supabase - Supabase client (service role)
 * @param path - Storage path
 * @returns Success status
 */
export async function deleteBoardFile(
  supabase: SupabaseClient,
  path: string
): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from("files")
      .remove([path]);

    if (error) {
      console.error('[Board File Delete] Failed to delete:', error);
      return false;
    }

    console.log('[Board File Delete] Successfully deleted:', path);
    return true;
  } catch (error) {
    console.error('[Board File Delete] Unexpected error:', error);
    return false;
  }
}
