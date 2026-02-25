import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, ClipboardCheck, Users } from "lucide-react";
import { CourseSettingsForm } from "./CourseSettingsForm";
import { AddModuleForm } from "./AddModuleForm";
import { DeleteModuleButton } from "./DeleteModuleButton";

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ companyId: string; courseId: string }>;
}) {
  const { companyId, courseId } = await params;
  const supabase = await createClient();
  const svc = getSvc();

  const { data: company } = await supabase
    .from("companies")
    .select("id, lms_enabled")
    .eq("id", companyId)
    .single();
  if (!company?.lms_enabled) redirect(`/dashboard/${companyId}/training`);

  const [{ data: course }, { data: modules }] = await Promise.all([
    supabase
      .from("lms_courses")
      .select("id, name, description, is_published, passing_threshold, template_id")
      .eq("id", courseId)
      .eq("company_id", companyId)
      .single(),
    svc
      .from("lms_modules")
      .select("id, title, is_final_exam, sort_order")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!course) notFound();

  const regularModules = (modules ?? []).filter((m) => !m.is_final_exam);
  const finalExam = (modules ?? []).find((m) => m.is_final_exam);

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-stone-500 mb-6">
          <Link href={`/dashboard/${companyId}/training`} className="hover:text-stone-700 transition-colors">
            Training
          </Link>
          <span>/</span>
          <span className="text-stone-900 font-medium">{course.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settings panel */}
          <div className="space-y-4">
            <CourseSettingsForm companyId={companyId} course={course} />
            <Link
              href={`/dashboard/${companyId}/training/${courseId}/learners`}
              className="flex items-center gap-2 px-4 py-3 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 hover:border-stone-300 hover:shadow-sm transition-all"
            >
              <Users className="w-4 h-4 text-stone-500" />
              View Learners
            </Link>
          </div>

          {/* Modules */}
          <div className="lg:col-span-2 space-y-4">
            {/* Regular modules */}
            <div>
              <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-3">
                Modules
              </h2>
              {regularModules.length === 0 ? (
                <p className="text-sm text-stone-400 py-4 text-center border border-dashed border-stone-200 rounded-lg">
                  No modules yet
                </p>
              ) : (
                <div className="space-y-2">
                  {regularModules.map((m, idx) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 p-3 bg-white border border-stone-200 rounded-lg"
                    >
                      <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-xs font-semibold text-stone-500 flex-shrink-0">
                        {idx + 1}
                      </div>
                      <BookOpen className="w-4 h-4 text-stone-400 flex-shrink-0" />
                      <Link
                        href={`/dashboard/${companyId}/training/${courseId}/modules/${m.id}`}
                        className="flex-1 text-sm text-stone-900 hover:text-blue-600 transition-colors font-medium"
                      >
                        {m.title}
                      </Link>
                      <DeleteModuleButton
                        companyId={companyId}
                        courseId={courseId}
                        moduleId={m.id}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <AddModuleForm companyId={companyId} courseId={courseId} isFinalExam={false} />

            {/* Final exam */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wide">
                  Final Exam
                </h2>
                <span className="text-xs text-stone-400">(unlocked after all modules pass)</span>
              </div>

              {finalExam ? (
                <div className="flex items-center gap-3 p-3 bg-white border border-stone-200 rounded-lg">
                  <ClipboardCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <Link
                    href={`/dashboard/${companyId}/training/${courseId}/modules/${finalExam.id}`}
                    className="flex-1 text-sm text-stone-900 hover:text-blue-600 transition-colors font-medium"
                  >
                    {finalExam.title}
                  </Link>
                  <DeleteModuleButton
                    companyId={companyId}
                    courseId={courseId}
                    moduleId={finalExam.id}
                  />
                </div>
              ) : (
                <AddModuleForm companyId={companyId} courseId={courseId} isFinalExam={true} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
