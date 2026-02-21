import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = await createClient();

    const [
      { data: userData, error: userError },
      { data: sessionData, error: sessionError },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);

    const user = userData.user;

    const {
      data: membershipsData,
      error: membershipsError,
    } = await supabase
      .from("account_memberships")
      .select("*")
      .eq("user_id", user?.id ?? "");

    let companiesData = null;
    let companiesError = null;

    if (membershipsData && membershipsData.length > 0) {
      const accountId = membershipsData[0].account_id;
      const companiesResult = await supabase
        .from("companies")
        .select("*")
        .eq("account_id", accountId);

      companiesData = companiesResult.data;
      companiesError = companiesResult.error;
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      environment: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
        NODE_ENV: process.env.NODE_ENV || null,
      },
      user: user
        ? {
            id: user.id,
            email: user.email,
            role: user.role,
            aud: user.aud,
            created_at: user.created_at,
          }
        : null,
      session: sessionData.session
        ? {
            user_id: sessionData.session.user.id,
            expires_at: sessionData.session.expires_at,
            expires_in: sessionData.session.expires_in,
          }
        : null,
      memberships: {
        data: membershipsData,
        error: membershipsError ? membershipsError.message : null,
        count: membershipsData?.length ?? 0,
      },
      companies: {
        data: companiesData,
        error: companiesError ? companiesError.message : null,
        count: companiesData?.length ?? 0,
      },
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
