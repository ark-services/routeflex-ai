import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/upload
 *
 * Accepts a single file upload as multipart/form-data and stores it in
 * Supabase Storage. Called client-side BEFORE the server action so that
 * large files never flow through the server action body (Vercel hard-caps
 * server action request bodies at 4.5 MB regardless of next.config.ts).
 *
 * Body (multipart/form-data):
 *   file     — the File to upload
 *   token    — public form token (used to look up company_id)
 *   jobId    — job UUID
 *   fieldKey — form field key (used in the storage path for organisation)
 */
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const token = formData.get("token") as string | null;
  const jobId = formData.get("jobId") as string | null;
  const fieldKey = formData.get("fieldKey") as string | null;

  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!token || !jobId) {
    return NextResponse.json(
      { error: "Missing token or jobId" },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File "${file.name}" exceeds 10 MB limit` },
      { status: 400 }
    );
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: `File type "${file.type}" is not allowed. Accepted: PDF, Word, images (JPG, PNG, GIF, WebP, HEIC).`,
      },
      { status: 400 }
    );
  }

  // Resolve companyId from token (validates the token is legitimate)
  const { data: formDetails, error: formError } = await supabase.rpc(
    "get_public_form_by_token",
    { token }
  );

  if (formError || !formDetails || formDetails.length === 0) {
    return NextResponse.json(
      { error: "Invalid form token" },
      { status: 401 }
    );
  }

  const companyId: string = formDetails[0].company_id;

  // Build storage path: {companyId}/{jobId}/{fieldKey}/{timestamp}-{filename}
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const folder = fieldKey || "files";
  const storagePath = `${companyId}/${jobId}/${folder}/${timestamp}-${sanitizedName}`;

  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(storagePath, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    console.error("[/api/upload] Storage upload failed:", uploadError);
    return NextResponse.json(
      { error: uploadError.message || "Upload failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ path: storagePath });
}
