import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        user: null,
        memberships: null,
        companies: null,
        all_jobs: null,
        scoped_jobs: null,
        errors: {
          user: userError?.message || "No authenticated user",
        },
      });
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("account_memberships")
      .select("*")
      .eq("user_id", user.id);

    const accountIds = memberships?.map((m) => m.account_id) || [];

    const { data: companies, error: companiesError } =
      accountIds.length > 0
        ? await supabase
            .from("companies")
            .select("*")
            .in("account_id", accountIds)
        : { data: null, error: null };

    const companyIds = companies?.map((c) => c.id) || [];

    const { data: allJobs, error: allJobsError } = await supabase
      .from("jobs")
      .select("*");

    const { data: scopedJobs, error: scopedJobsError } =
      companyIds.length > 0
        ? await supabase.from("jobs").select("*").in("company_id", companyIds)
        : { data: null, error: null };

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      memberships: {
        data: memberships,
        count: memberships?.length || 0,
        account_ids: accountIds,
      },
      companies: {
        data: companies,
        count: companies?.length || 0,
        company_ids: companyIds,
      },
      all_jobs: {
        data: allJobs,
        count: allJobs?.length || 0,
      },
      scoped_jobs: {
        data: scopedJobs,
        count: scopedJobs?.length || 0,
      },
      errors: {
        user: userError?.message || null,
        memberships: membershipsError?.message || null,
        companies: companiesError?.message || null,
        all_jobs: allJobsError?.message || null,
        scoped_jobs: scopedJobsError?.message || null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        user: null,
        memberships: null,
        companies: null,
        all_jobs: null,
        scoped_jobs: null,
        errors: {
          fatal: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 500 }
    );
  }
}
