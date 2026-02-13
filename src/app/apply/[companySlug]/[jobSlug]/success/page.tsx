import { Card } from "@/components/ui/card";
import Link from "next/link";

export default async function SuccessPage({
  params,
}: {
  params: Promise<{ companySlug: string; jobSlug: string }>;
}) {
  const { companySlug, jobSlug } = await params;

  return (
    <div className="min-h-screen bg-stone-50/50 p-4 sm:p-8 flex items-center justify-center">
      <Card className="p-8 sm:p-12 max-w-md text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <svg
            className="w-6 h-6 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-stone-900">
          Application Submitted!
        </h1>
        <p className="text-stone-500">
          Thank you for applying. We&apos;ll review your application and get back to
          you soon.
        </p>
        <div className="pt-4">
          <Link
            href={`/apply/${companySlug}/${jobSlug}`}
            className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
          >
            &larr; Back to job posting
          </Link>
        </div>
      </Card>
    </div>
  );
}
