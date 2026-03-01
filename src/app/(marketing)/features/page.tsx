import type { Metadata } from "next";
import Link from "next/link";
import {
  LayoutDashboard,
  Zap,
  Sparkles,
  ShieldCheck,
  GraduationCap,
  FileText,
  ArrowRight,
  Columns3,
  Mail,
  Bot,
  Clock,
  CheckCircle2,
  BookOpen,
  ListChecks,
  FormInput,
  Palette,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features - RouteFlex",
  description:
    "Explore RouteFlex features: kanban boards, automations, AI email, background checks, LMS training, and custom application forms.",
};

const featureSections = [
  {
    icon: LayoutDashboard,
    title: "Applicant Board",
    description:
      "A visual, Monday-style kanban board that gives you full visibility into every applicant across every stage of your hiring pipeline.",
    bullets: [
      "Drag-and-drop applicants between custom stages",
      "Group applicants by status, location, or any field",
      "Customizable columns with text, dates, dropdowns, and more",
      "Real-time updates — see changes as they happen",
    ],
    visual: (
      <div className="rounded-rf-lg border border-rf-border bg-rf-surface-page p-4 shadow-rf-sm">
        <div className="flex gap-3">
          {["Applied", "Screening", "Hired"].map((col, i) => (
            <div key={col} className="flex-1 min-w-0">
              <div className="text-xs font-bold text-rf-text-muted uppercase tracking-wider mb-3">
                {col}
              </div>
              <div className="space-y-2">
                {Array.from({ length: 3 - i }).map((_, j) => (
                  <div
                    key={j}
                    className="rounded-rf-md bg-rf-surface-card border border-rf-border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-rf-blue-tint flex items-center justify-center text-[10px] font-bold text-rf-blue">
                        {["JJ", "SA", "MB", "KR", "TL"][i + j]}
                      </div>
                      <div className="h-2.5 rounded-full bg-rf-ink-100 flex-1" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: Zap,
    title: "Automation Engine",
    description:
      "Build trigger-based workflows that handle repetitive tasks automatically. No code required — just pick a trigger, set conditions, and choose actions.",
    bullets: [
      "Trigger on stage changes, form submissions, or time delays",
      "Send personalized emails automatically",
      "Order background checks when applicants reach a stage",
      "Chain multiple actions in a single automation",
    ],
    visual: (
      <div className="rounded-rf-lg border border-rf-border bg-rf-surface-page p-5 shadow-rf-sm space-y-3">
        {[
          { icon: Bot, label: "When", value: "Applicant moves to Screening", color: "bg-rf-blue-tint text-rf-blue" },
          { icon: Mail, label: "Then", value: "Send welcome email", color: "bg-rf-success-bg text-rf-success" },
          { icon: Clock, label: "Wait", value: "24 hours", color: "bg-rf-warning-bg text-rf-warning" },
          { icon: ShieldCheck, label: "Then", value: "Order background check", color: "bg-rf-info-bg text-rf-info" },
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-rf-md flex items-center justify-center ${step.color}`}>
              <step.icon className="h-4 w-4" />
            </div>
            <span className="text-xs font-bold text-rf-text-muted uppercase w-10">{step.label}</span>
            <span className="text-sm font-medium text-rf-text-primary">{step.value}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Sparkles,
    title: "AI Email Composer",
    description:
      "Generate professional, personalized emails in one click. The AI understands each applicant's context — name, stage, job details — so every message feels hand-written.",
    bullets: [
      "One-click email generation with applicant context",
      "Customize tone, length, and intent",
      "Use in automations or the manual compose flow",
      "Edit before sending — you stay in control",
    ],
    visual: (
      <div className="rounded-rf-lg border border-rf-border bg-rf-surface-page p-4 shadow-rf-sm">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-rf-blue" />
          <span className="text-xs font-bold text-rf-text-primary">AI Draft</span>
        </div>
        <div className="space-y-2">
          <div className="h-2.5 rounded-full bg-rf-ink-100 w-full" />
          <div className="h-2.5 rounded-full bg-rf-ink-100 w-5/6" />
          <div className="h-2.5 rounded-full bg-rf-ink-100 w-4/6" />
        </div>
        <div className="mt-4 pt-3 border-t border-rf-border flex gap-2">
          <div className="text-xs font-semibold text-rf-blue bg-rf-blue-tint px-3 py-1.5 rounded-rf-md">
            Send
          </div>
          <div className="text-xs font-semibold text-rf-text-secondary border border-rf-border px-3 py-1.5 rounded-rf-md">
            Edit
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Background Check Integration",
    description:
      "Order FADV background checks directly from the applicant board. Track status in real-time without switching between platforms.",
    bullets: [
      "One-click ordering from the applicant board",
      "Real-time status updates (ordered, processing, complete)",
      "Automatic stage transitions on check completion",
      "Full audit trail for compliance",
    ],
    visual: (
      <div className="rounded-rf-lg border border-rf-border bg-rf-surface-page p-5 shadow-rf-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-rf-text-primary">Background Check</span>
          <span className="text-xs font-bold text-rf-success bg-rf-success-bg px-2 py-1 rounded-rf-pill">Complete</span>
        </div>
        <div className="flex items-center gap-2">
          {["Ordered", "Processing", "Complete"].map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                i <= 2 ? "bg-rf-success text-white" : "bg-rf-ink-100"
              }`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-medium text-rf-text-muted">{s}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: GraduationCap,
    title: "Training & LMS",
    description:
      "Onboard new hires with a built-in learning management system. Create courses with modules, videos, and quizzes — then track completion automatically.",
    bullets: [
      "Build courses with text, video, and quiz modules",
      "Magic-link access — no account needed for learners",
      "Track progress and quiz scores per employee",
      "Trigger automations when a course is completed",
    ],
    visual: (
      <div className="rounded-rf-lg border border-rf-border bg-rf-surface-page p-4 shadow-rf-sm">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="h-5 w-5 text-rf-blue" />
          <span className="text-sm font-semibold text-rf-text-primary">Driver Orientation</span>
        </div>
        <div className="space-y-2.5">
          {[
            { label: "Safety Protocol", pct: 100 },
            { label: "Route Basics", pct: 100 },
            { label: "Final Exam", pct: 60 },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-3">
              <ListChecks className="h-3.5 w-3.5 text-rf-text-muted flex-shrink-0" />
              <span className="text-xs font-medium text-rf-text-secondary flex-1">{m.label}</span>
              <div className="w-16 h-1.5 rounded-full bg-rf-ink-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-rf-blue"
                  style={{ width: `${m.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: FileText,
    title: "Custom Application Forms",
    description:
      "Create branded application pages with custom fields. Share a link and start collecting applicant data — no integrations or plugins required.",
    bullets: [
      "Drag-and-drop form builder with field types",
      "Branded with your company name and colors",
      "Shareable link for each job posting",
      "Submissions flow directly into the applicant board",
    ],
    visual: (
      <div className="rounded-rf-lg border border-rf-border bg-rf-surface-page p-4 shadow-rf-sm">
        <div className="flex items-center gap-2 mb-4">
          <FormInput className="h-4 w-4 text-rf-blue" />
          <span className="text-sm font-semibold text-rf-text-primary">Application Form</span>
        </div>
        <div className="space-y-3">
          {["Full Name", "Email Address", "Phone Number", "CDL License"].map((f) => (
            <div key={f}>
              <div className="text-[10px] font-bold text-rf-text-muted uppercase tracking-wider mb-1">{f}</div>
              <div className="h-8 rounded-rf-md bg-rf-surface-input border border-rf-border" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 bg-rf-surface-page">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-rf-text-primary">
            Powerful Features for Modern Recruiting
          </h1>
          <p className="text-lg text-rf-text-secondary mt-6 max-w-2xl mx-auto leading-relaxed">
            Everything you need to attract, screen, and onboard drivers — built into one platform.
          </p>
        </div>
      </section>

      {/* Feature sections */}
      {featureSections.map((feature, index) => (
        <section
          key={feature.title}
          className={`py-20 ${index % 2 === 0 ? "bg-rf-surface-card" : "bg-rf-surface-page"}`}
        >
          <div className="max-w-6xl mx-auto px-6">
            <div
              className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                index % 2 !== 0 ? "lg:[direction:rtl]" : ""
              }`}
            >
              {/* Text side */}
              <div className={index % 2 !== 0 ? "lg:[direction:ltr]" : ""}>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-rf-pill bg-rf-blue-tint text-rf-blue mb-4">
                  <feature.icon className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {feature.title}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-rf-text-primary mt-2">
                  {feature.title}
                </h2>
                <p className="text-rf-text-secondary mt-4 leading-relaxed">
                  {feature.description}
                </p>
                <ul className="mt-6 space-y-2.5">
                  {feature.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2.5 text-sm text-rf-text-secondary"
                    >
                      <CheckCircle2 className="h-4 w-4 text-rf-success flex-shrink-0 mt-0.5" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Visual side */}
              <div className={index % 2 !== 0 ? "lg:[direction:ltr]" : ""}>
                {feature.visual}
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Bottom CTA */}
      <section className="py-24 bg-rf-ink-900">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            See It in Action
          </h2>
          <p className="text-rf-ink-300 mt-4 max-w-xl mx-auto">
            Start using RouteFlex today and experience the difference.
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
