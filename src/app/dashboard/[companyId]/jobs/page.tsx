import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// This route is deprecated. Redirect to the company dashboard.
export default async function JobsPageRedirect({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  redirect(`/dashboard/${companyId}`);
}
