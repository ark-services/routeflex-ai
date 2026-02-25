import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Eye, EyeOff, Users } from "lucide-react";
import { CreateCourseClient } from "./CreateCourseClient";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function TrainingPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const supabase = await createClient();
  const svc = getSvc();

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, lms_enabled")
    .eq("id", companyId)
    .single();

  if (!company) redirect("/dashboard");
  if (!company.lms_enabled) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <h1 className="text-lg font-semibold text-stone-800 mb-2">Training not enabled</h1>
          <p className="text-sm text-stone-500">
            The LMS feature is not enabled for your account. Contact support to upgrade your plan.
          </p>
        </div>
      </div>
    );
  }

  const [{ data: courses }, { data: templates }] = await Promise.all([
    supabase
      .from("lms_courses")
      .select("id, name, description, is_published, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    svc
      .from("lms_course_templates")
      .select("id, name, carrier_type")
      .eq("is_published", true)
      .order("name"),
  ]);

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Training</h1>
            <p className="text-sm text-stone-500 mt-1">
              Manage training courses for your new hires.
            </p>
          </div>
          <CreateCourseClient companyId={companyId} templates={templates ?? []} />
        </div>

        {(courses ?? []).length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-stone-600 mb-1">No courses yet</p>
            <p className="text-xs text-stone-400">
              Create a course from a template or start from scratch.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(courses ?? []).map((c) => (
              <div
                key={c.id}
                className="relative flex items-center gap-4 p-4 bg-white border border-stone-200 rounded-lg hover:border-stone-300 hover:shadow-sm transition-all"
              >
                {/* Full-bleed invisible primary link — covers the whole card */}
                <Link
                  href={`/dashboard/${companyId}/training/${c.id}`}
                  className="absolute inset-0 rounded-lg"
                  aria-label={c.name}
                />
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-stone-900">{c.name}</span>
                    {c.is_published ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-green-50 text-green-700 rounded-full border border-green-200">
                        <Eye className="w-3 h-3" /> Published
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-stone-100 text-stone-500 rounded-full border border-stone-200">
                        <EyeOff className="w-3 h-3" /> Draft
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-xs text-stone-500 truncate mt-0.5">{c.description}</p>
                  )}
                </div>
                {/* Secondary actions sit above the overlay link via z-10 */}
                <div className="relative z-10 flex items-center gap-4 flex-shrink-0">
                  <Link
                    href={`/dashboard/${companyId}/training/${c.id}/learners`}
                    className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Learners
                  </Link>
                  <div className="text-xs text-stone-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
