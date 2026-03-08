import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/templates/signed-url?path=<storage-path>
 *
 * Returns a 1-hour signed URL for a template thumbnail.
 * Auth: any authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json({ error: "Missing required param: path" }, { status: 400 });
    }

    // Path safety: reject traversal, null bytes, double slashes, and paths outside expected prefix
    if (
      path.includes('..') ||
      path.includes('\0') ||
      path.includes('//') ||
      !path.startsWith('thumbnails/')
    ) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceClient();

    const { data, error } = await serviceClient.storage
      .from("templates")
      .createSignedUrl(path, 3600); // 1-hour expiry

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Failed to create signed URL" }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
