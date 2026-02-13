import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitApplication } from "./actions";

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ companySlug: string; jobSlug: string }>;
}) {
  const { companySlug, jobSlug } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .single();

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-stone-500">Company not found</p>
      </div>
    );
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("company_id", company.id)
    .eq("slug", jobSlug)
    .eq("status", "open")
    .single();

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-stone-500">Job not found or not accepting applications</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50/50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            {job.title}
          </h1>
          <p className="text-stone-500">{company.name}</p>
          {job.location && (
            <p className="text-sm text-stone-400">{job.location}</p>
          )}
          {job.terminal && (
            <p className="text-sm text-stone-400">Terminal: {job.terminal}</p>
          )}
        </div>

        {/* Application form */}
        <Card className="p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-stone-900 mb-6">
            Apply for this position
          </h2>
          <form action={submitApplication} className="space-y-5">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="jobSlug" value={jobSlug} />

            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-stone-700 mb-2"
              >
                Full Name *
              </label>
              <Input
                id="fullName"
                name="fullName"
                placeholder="John Doe"
                required
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-stone-700 mb-2"
              >
                Email *
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="john@example.com"
                required
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-stone-700 mb-2"
              >
                Phone *
              </label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="(555) 123-4567"
                required
              />
            </div>

            <div>
              <label
                htmlFor="terminalPreference"
                className="block text-sm font-medium text-stone-700 mb-2"
              >
                Terminal Preference
              </label>
              <Input
                id="terminalPreference"
                name="terminalPreference"
                placeholder="Preferred terminal location"
              />
            </div>

            <div>
              <label
                htmlFor="experience"
                className="block text-sm font-medium text-stone-700 mb-2"
              >
                Relevant Experience *
              </label>
              <textarea
                id="experience"
                name="experience"
                rows={6}
                required
                placeholder="Tell us about your relevant experience..."
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
              />
            </div>

            <div>
              <label
                htmlFor="resume"
                className="block text-sm font-medium text-stone-700 mb-2"
              >
                Resume (PDF, DOC, DOCX)
              </label>
              <input
                id="resume"
                name="resume"
                type="file"
                accept=".pdf,.doc,.docx"
                className="block w-full text-sm text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-stone-900 file:text-white hover:file:bg-stone-800 file:cursor-pointer"
              />
            </div>

            <Button type="submit" className="w-full">
              Submit Application
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
