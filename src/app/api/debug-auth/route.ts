import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const [
      { data: userData, error: userError },
      { data: sessionData, error: sessionError },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      user: userData.user
        ? {
            id: userData.user.id,
            email: userData.user.email,
            role: userData.user.role,
            aud: userData.user.aud,
            created_at: userData.user.created_at,
          }
        : null,
      session: sessionData.session
        ? {
            user_id: sessionData.session.user.id,
            expires_at: sessionData.session.expires_at,
            expires_in: sessionData.session.expires_in,
          }
        : null,
      errors: {
        user: userError ? userError.message : null,
        session: sessionError ? sessionError.message : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        error: "Failed to debug auth",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
