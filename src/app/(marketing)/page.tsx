import Link from "next/link";
import {
  LayoutDashboard,
  Zap,
  Sparkles,
  ShieldCheck,
  GraduationCap,
  FileText,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: LayoutDashboard,
    title: "Applicant Boards",
    description:
      "Monday-style kanban boards to track every applicant from application to hire. Custom columns, groups, and statuses.",
  },
  {
    icon: Zap,
    title: "Smart Automations",
    description:
      "Trigger emails, background checks, and status changes automatically when applicants move through your pipeline.",
  },
  {
    icon: Sparkles,
    title: "AI Email Generation",
    description:
      "Generate personalized email drafts in seconds with AI that understands each applicant's context.",
  },
  {
    icon: ShieldCheck,
    title: "Background Checks",
    description:
      "Integrated FADV background screening. Order checks and track results without leaving the platform.",
  },
  {
    icon: GraduationCap,
    title: "Training & LMS",
    description:
      "Onboard new hires with built-in courses, quizzes, and completion tracking. No third-party tools needed.",
  },
  {
    icon: FileText,
    title: "Application Forms",
    description:
      "Branded application pages with custom fields. Share a link and collect applicant data instantly.",
  },
];

const steps = [
  {
    number: 1,
    title: "Create Your Job",
    description:
      "Set up a job posting with your requirements and application form in minutes. Share the link to start collecting applicants.",
  },
  {
    number: 2,
    title: "Automate Your Pipeline",
    description:
      "Configure automations to send emails, run background checks, and move applicants through stages — hands-free.",
  },
  {
    number: 3,
    title: "Hire with Confidence",
    description:
      "Track every applicant on a visual board, train new hires with built-in courses, and scale your operation.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-rf-blue-tint/50 to-rf-surface-page pointer-events-none" />

        {/* Decorative chevrons */}
        <div className="absolute top-20 left-[10%] opacity-[0.04] pointer-events-none">
          <svg width="200" height="200" viewBox="0 0 48 48" fill="none">
            <path d="M4 8 L20 24 L4 40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M24 8 L40 24 L24 40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="absolute bottom-10 right-[8%] opacity-[0.04] pointer-events-none rotate-180">
          <svg width="160" height="160" viewBox="0 0 48 48" fill="none">
            <path d="M4 8 L20 24 L4 40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M24 8 L40 24 L24 40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="relative max-w-4xl mx-auto text-center px-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-rf-pill bg-rf-blue-tint text-rf-blue text-xs font-bold tracking-wide uppercase mb-8">
            Built for FedEx Ground Contractors
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-rf-text-primary leading-[1.05]">
            Recruiting on{" "}
            <span className="text-rf-blue">Autopilot</span>
          </h1>

          <p className="text-lg sm:text-xl text-rf-text-secondary max-w-2xl mx-auto mt-6 leading-relaxed">
            The all-in-one platform to post jobs, track applicants, run background
            checks, and onboard drivers — without the spreadsheet chaos.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-dark px-6 py-3 rounded-rf-md transition-colors shadow-rf-md"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center gap-2 text-sm font-semibold text-rf-text-secondary hover:text-rf-text-primary border border-rf-border hover:border-rf-ink-300 px-6 py-3 rounded-rf-md transition-colors"
            >
              See All Features
            </Link>
          </div>
        </div>
      </section>

      {/* ── Feature Highlights ── */}
      <section className="py-24 bg-rf-surface-card">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary">
              Everything You Need to Hire Faster
            </h2>
            <p className="text-rf-text-secondary mt-4 max-w-2xl mx-auto">
              From first application to first day on the road — one platform handles it all.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-rf-lg border border-rf-border bg-rf-surface-page p-8 hover:shadow-rf-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-rf-lg bg-rf-blue-tint flex items-center justify-center mb-5">
                  <feature.icon className="h-6 w-6 text-rf-blue" />
                </div>
                <h3 className="text-lg font-semibold text-rf-text-primary mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-rf-text-secondary leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 bg-rf-surface-page">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary text-center mb-16">
            How It Works
          </h2>

          <div className="space-y-12">
            {steps.map((step) => (
              <div key={step.number} className="flex items-start gap-6">
                <div className="w-10 h-10 rounded-full bg-rf-blue text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-rf-text-primary">
                    {step.title}
                  </h3>
                  <p className="text-rf-text-secondary mt-2 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-24 bg-rf-ink-900">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Ready to Streamline Your Recruiting?
          </h2>
          <p className="text-rf-ink-300 mt-4 max-w-xl mx-auto">
            Join FedEx contractors who are hiring faster with less manual work.
            Get started in minutes.
          </p>
          <div className="mt-10">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-light px-6 py-3 rounded-rf-md transition-colors shadow-rf-lg"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
