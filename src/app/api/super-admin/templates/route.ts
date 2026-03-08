import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { SUPER_ADMIN_EMAIL } from "@/lib/constants";

/**
 * GET /api/super-admin/templates
 * Returns all templates (including drafts) for the super admin template picker.
 * Only accessible by the super admin.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || user.email !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("templates")
      .select("id, title, is_published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/super-admin/templates
 * Body: { templateId: string }
 * Soft-deletes a template by setting deleted_at = now().
 * Uses the service-role client to bypass RLS.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || user.email !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { templateId } = body as { templateId?: string };

    if (!templateId || typeof templateId !== "string") {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }

    // Use service-role client so the UPDATE is not subject to RLS.
    const serviceClient = createServiceClient();
    const { error } = await serviceClient
      .from("templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", templateId)
      .is("deleted_at", null); // no-op if already soft-deleted

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
