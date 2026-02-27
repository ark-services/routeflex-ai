import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { CreateCourseClient } from "./CreateCourseClient";
import { TrainingListClient } from "./TrainingListClient";

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

  const [{ data: coursesRaw }, { data: templates }] = await Promise.all([
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

  // Count enrollments per course
  const courseIds = (coursesRaw ?? []).map((c) => c.id);
  const { data: enrollments } = courseIds.length
    ? await svc
        .from("lms_enrollments")
        .select("course_id")
        .in("course_id", courseIds)
    : { data: [] };

  const countMap: Record<string, number> = {};
  for (const e of enrollments ?? []) {
    countMap[e.course_id] = (countMap[e.course_id] ?? 0) + 1;
  }

  const courses = (coursesRaw ?? []).map((c) => ({
    ...c,
    enrollmentCount: countMap[c.id] ?? 0,
  }));

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

        {courses.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-stone-600 mb-1">No courses yet</p>
            <p className="text-xs text-stone-400">
              Create a course from a template or start from scratch.
            </p>
          </div>
        ) : (
          <TrainingListClient courses={courses} companyId={companyId} />
        )}
      </div>
    </div>
  );
}
