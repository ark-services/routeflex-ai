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

    const user = userData.user;

    // Query memberships
    const {
      data: membershipsData,
      error: membershipsError,
    } = await supabase
      .from("account_memberships")
      .select("*")
      .eq("user_id", user?.id ?? "");

    console.log("DEBUG memberships:", {
      data: membershipsData,
      error: membershipsError,
      count: membershipsData?.length ?? 0,
    });

    // Query companies if we have memberships
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

      console.log("DEBUG companies:", {
        data: companiesData,
        error: companiesError,
        count: companiesData?.length ?? 0,
      });
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
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
