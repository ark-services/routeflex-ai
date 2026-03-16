import type { Metadata } from "next";
import Link from "next/link";
import { WaitlistButton } from "@/components/marketing/WaitlistButton";
import {
  ArrowRight,
  Bot,
  MessageSquare,
  Star,
  LayoutDashboard,
  MapPin,
  CalendarClock,
  BookOpen,
  CalendarRange,
  BarChart3,
  ShieldCheck,
  Zap,
  GraduationCap,
  ClipboardList,
  Car,
  Plane,
  Calendar,
  Layers,
  UserCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features - RouteFlex",
  description:
    "Build AI agents for every step in your hiring pipeline — screening, background checks, training, onboarding, and more.",
};

/* ── Agent capability areas ── */
const capabilities = [
  {
    id: "screening",
    emoji: "🔍",
    label: "Screening",
    color: "bg-rf-blue",
    title: "Build a screener that learns what a good hire looks like",
    description:
      "Create an agent that screens every applicant against FedEx requirements and your custom preferences. It scores candidates, sends personalized responses, answers questions from your knowledge base, and gets smarter with every hire.",
    features: [
      {
        icon: Bot,
        title: "AI Screening & Scoring",
        description:
          "Automatically checks candidates against FedEx requirements and your custom preferences. Each applicant gets a fit score so you focus on the best.",
      },
      {
        icon: MessageSquare,
        title: "AI-Written Communication",
        description:
          "Emails, text reminders, screening questions, and responses — all written by AI that matches your voice. No more ghosted candidates.",
      },
      {
        icon: BookOpen,
        title: "Knowledge Base",
        description:
          "Train your screening agent with your best practices, FAQs, and preferences. It learns what works for your operation.",
      },
      {
        icon: Star,
        title: "Improves Over Time",
        description:
          "The more applicants interact with your pipeline, the better your agent gets at identifying top candidates and matching your hiring patterns.",
      },
    ],
    visual: (
      <div className="rounded-rf-xl border border-rf-border bg-rf-surface-page p-5 shadow-rf-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">🔍</span>
          <span className="text-xs font-bold text-rf-text-primary">
            Screener Agent
          </span>
          <span className="text-[10px] font-mono text-rf-success bg-rf-success-bg px-2 py-0.5 rounded-rf-pill ml-auto">
            Active
          </span>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center gap-3 rounded-rf-md bg-rf-surface-card border border-rf-border p-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-rf-text-primary">
                Screened 4 new applicants
              </div>
              <div className="text-[9px] font-mono text-rf-text-muted">
                2 qualified · 1 needs review · 1 filtered
              </div>
            </div>
            <span className="text-[9px] text-rf-text-muted">2m ago</span>
          </div>
          <div className="flex items-center gap-3 rounded-rf-md bg-rf-surface-card border border-rf-border p-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-rf-text-primary">
                Sent follow-up to Karen Rodriguez
              </div>
              <div className="text-[9px] font-mono text-rf-text-muted">
                Email + SMS reminder · Interview confirmation
              </div>
            </div>
            <span className="text-[9px] text-rf-text-muted">15m ago</span>
          </div>
          <div className="flex items-center gap-3 rounded-rf-md bg-rf-surface-card border border-rf-border p-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-rf-text-primary">
                Answered candidate question
              </div>
              <div className="text-[9px] font-mono text-rf-text-muted">
                &ldquo;What&apos;s the pay structure?&rdquo; → Knowledge base
                response
              </div>
            </div>
            <span className="text-[9px] text-rf-text-muted">1h ago</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "background-checks",
    emoji: "🛡️",
    label: "Background Checks",
    color: "bg-[#16A34A]",
    title: "An FADV agent that handles background checks end to end",
    description:
      "Build an agent that auto-submits qualified candidates to First Advantage, approves background checks, tracks status in real time, and follows up when candidates stall. The deepest FADV integration in the industry.",
    features: [
      {
        icon: ShieldCheck,
        title: "Automatic Submission",
        description:
          "When a candidate is ready, your agent submits their application to First Advantage automatically. No manual data entry.",
      },
      {
        icon: UserCheck,
        title: "Background Check Approval",
        description:
          "Approve background checks directly from your pipeline. Status updates sync back in real time.",
      },
      {
        icon: BarChart3,
        title: "Real-Time Status Tracking",
        description:
          "See exactly where every candidate is in the FADV process. Get notified when checks clear or need attention.",
      },
      {
        icon: Zap,
        title: "Automated Follow-Up",
        description:
          "Candidates who stall in the FADV process get automatic nudges via email or text. Nothing falls through the cracks.",
      },
    ],
    visual: (
      <div className="rounded-rf-xl border border-rf-border bg-rf-surface-page p-5 shadow-rf-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">🛡️</span>
          <span className="text-xs font-bold text-rf-text-primary">
            FADV Agent
          </span>
        </div>
        <div className="space-y-2.5">
          {[
            {
              name: "Diana Patel",
              status: "Clear",
              statusColor: "text-rf-success bg-rf-success-bg",
              detail: "Background check passed",
            },
            {
              name: "Tom Lee",
              status: "In Progress",
              statusColor: "text-[#D97706] bg-[#D97706]/10",
              detail: "Submitted 2 days ago",
            },
            {
              name: "Sarah Adams",
              status: "Auto-Submitted",
              statusColor: "text-rf-blue bg-rf-blue-tint",
              detail: "Just now",
            },
          ].map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-3 rounded-rf-md bg-rf-surface-card border border-rf-border p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-rf-text-primary">
                  {c.name}
                </div>
                <div className="text-[9px] font-mono text-rf-text-muted">
                  {c.detail}
                </div>
              </div>
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-rf-pill ${c.statusColor}`}
              >
                {c.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "training-onboarding",
    emoji: "🎓",
    label: "Training & Onboarding",
    color: "bg-[#D97706]",
    title: "Agents that take candidates from cleared to route-ready",
    description:
      "Build agents for every post-background-check step — safety training, road tests, HR paperwork, TSA clearance, and Day 1 scheduling. This is the work agencies never touch.",
    features: [
      {
        icon: GraduationCap,
        title: "Built-In LMS",
        description:
          "Assign safety training, onboarding courses, and continuing education. Candidates complete modules before they start.",
      },
      {
        icon: Car,
        title: "Road Test Scheduling",
        description:
          "Schedule and track road tests directly from your pipeline. Candidates get automatic reminders.",
      },
      {
        icon: ClipboardList,
        title: "HR Paperwork Tracking",
        description:
          "Track W-4s, I-9s, direct deposit forms, and every document needed before day one.",
      },
      {
        icon: Plane,
        title: "TSA Process Management",
        description:
          "Manage the TSA vetting process with status tracking and automated follow-ups.",
      },
      {
        icon: Calendar,
        title: "First Day Scheduling",
        description:
          "Coordinate start dates, orientation schedules, and equipment assignments all from one dashboard.",
      },
    ],
    visual: (
      <div className="rounded-rf-xl border border-rf-border bg-rf-surface-page p-5 shadow-rf-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">📋</span>
          <span className="text-xs font-bold text-rf-text-primary">
            HR Agent — Diana Patel
          </span>
        </div>
        <div className="space-y-2">
          {[
            { task: "Safety Training", status: "Completed", done: true },
            { task: "Road Test", status: "Scheduled — Mar 14", done: false },
            { task: "HR Paperwork", status: "3 of 5 submitted", done: false },
            { task: "TSA Vetting", status: "In Progress", done: false },
            { task: "First Day", status: "Mar 17", done: false },
          ].map((item) => (
            <div
              key={item.task}
              className="flex items-center gap-3 rounded-rf-md bg-rf-surface-card border border-rf-border p-3"
            >
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? "bg-[#16A34A] border-[#16A34A]" : "border-rf-ink-100"}`}
              >
                {item.done && (
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-rf-text-primary">
                  {item.task}
                </div>
              </div>
              <span
                className={`text-[9px] font-mono ${item.done ? "text-rf-success" : "text-rf-text-muted"}`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "pipeline",
    emoji: "📊",
    label: "Pipeline Management",
    color: "bg-rf-blue",
    title: "A pipeline agent that keeps everything organized",
    description:
      "Build agents to manage your board — archiving stale candidates, syncing statuses, managing multi-location dashboards, and handling seasonal hiring ramps. Your pipeline stays clean without you lifting a finger.",
    features: [
      {
        icon: Layers,
        title: "Templates & Custom Workspaces",
        description:
          "Deploy a pre-built agent team and get a proven workflow out of the box. Or build your own from scratch.",
      },
      {
        icon: LayoutDashboard,
        title: "Visual Pipeline Dashboard",
        description:
          "See every candidate's status at a glance — new, screening, qualified, interview, hired. Drag and drop to move them forward.",
      },
      {
        icon: MapPin,
        title: "Multi-Location Management",
        description:
          "Toggle between locations or see everything at once. One dashboard, one subscription, no per-location upcharges.",
      },
      {
        icon: CalendarClock,
        title: "Interview Scheduling",
        description:
          "One-click scheduling with automatic calendar sync and candidate reminders.",
      },
      {
        icon: CalendarRange,
        title: "Seasonal Hiring Mode",
        description:
          "Ramp up agents before peak season. Wind down when you're staffed. Pause anytime.",
      },
    ],
    visual: (
      <div className="rounded-rf-xl border border-rf-border bg-rf-surface-page p-5 shadow-rf-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">📊</span>
          <span className="text-xs font-bold text-rf-text-primary">
            Pipeline Admin
          </span>
          <span className="text-[10px] font-mono text-rf-text-muted ml-auto">
            Portland + Seattle
          </span>
        </div>
        <div className="flex gap-3">
          {[
            { name: "New", count: 8, color: "bg-rf-blue" },
            { name: "Screened", count: 5, color: "bg-[#D97706]" },
            { name: "Interview", count: 3, color: "bg-rf-info" },
            { name: "Hired", count: 2, color: "bg-[#16A34A]" },
          ].map((col) => (
            <div key={col.name} className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-2">
                <div className={`w-1.5 h-1.5 rounded-full ${col.color}`} />
                <span className="text-[9px] font-bold text-rf-text-muted uppercase tracking-wider">
                  {col.name}
                </span>
              </div>
              <div className="text-center py-3 rounded-rf-md bg-rf-surface-card border border-rf-border">
                <span className="text-lg font-black text-rf-text-primary">
                  {col.count}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

/* ── Workflow step indicator ── */
function WorkflowNav() {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 mb-4 flex-wrap">
      {capabilities.map((cap, i) => (
        <div key={cap.id} className="flex items-center gap-2 sm:gap-4">
          <a
            href={`#${cap.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-rf-pill text-xs font-bold uppercase tracking-wide hover:bg-rf-blue-tint hover:text-rf-blue transition-colors text-rf-text-muted"
          >
            <span className="text-sm">{cap.emoji}</span>
            {cap.label}
          </a>
          {i < capabilities.length - 1 && (
            <ArrowRight className="h-3 w-3 text-rf-text-muted hidden sm:block" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-28 pb-8 sm:pt-36 sm:pb-12 bg-rf-surface-page overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-10 text-center">
          <p className="text-xs font-bold text-rf-blue uppercase tracking-widest mb-4">
            Platform
          </p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-rf-text-primary max-w-3xl mx-auto">
            Build agents for every step in your pipeline.
          </h1>
          <p className="text-lg text-rf-text-secondary mt-5 max-w-2xl mx-auto leading-relaxed">
            Each agent is specialized — screening, background checks, training,
            onboarding, and more. You decide what they do. They learn how to do
            it better.
          </p>

          <div className="mt-10">
            <WorkflowNav />
          </div>
        </div>
      </section>

      {/* Capability sections */}
      {capabilities.map((cap, index) => (
        <section
          key={cap.id}
          id={cap.id}
          className={`py-16 sm:py-20 scroll-mt-20 ${
            index % 2 === 0
              ? "bg-rf-surface-card border-y border-rf-border"
              : "bg-rf-surface-page"
          }`}
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <div
              className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start ${
                index % 2 !== 0 ? "lg:[direction:rtl]" : ""
              }`}
            >
              {/* Text side */}
              <div className={index % 2 !== 0 ? "lg:[direction:ltr]" : ""}>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-rf-pill bg-rf-blue-tint text-rf-blue mb-4">
                  <span className="text-sm">{cap.emoji}</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide">
                    {cap.label}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-rf-text-primary mt-1">
                  {cap.title}
                </h2>
                <p className="text-rf-text-secondary mt-4 leading-relaxed">
                  {cap.description}
                </p>

                <div className="mt-8 space-y-5">
                  {cap.features.map((feature) => (
                    <div key={feature.title} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-rf-md bg-rf-blue-tint flex items-center justify-center flex-shrink-0 mt-0.5">
                        <feature.icon className="h-4 w-4 text-rf-blue" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-rf-text-primary">
                          {feature.title}
                        </h3>
                        <p className="text-sm text-rf-text-secondary mt-0.5 leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visual side */}
              <div
                className={`${
                  index % 2 !== 0 ? "lg:[direction:ltr]" : ""
                } max-w-md lg:max-w-none mx-auto w-full lg:sticky lg:top-28`}
              >
                {cap.visual}
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Bottom CTA */}
      <section className="relative overflow-hidden bg-[#0F1623] py-20 sm:py-24">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Ready to build your recruiting team?
          </h2>
          <p className="text-[#9BAABB] mt-4 max-w-xl mx-auto leading-relaxed">
            Deploy your first agent team today. No contracts, no recruiter fees.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
            <WaitlistButton className="inline-flex items-center gap-2 text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-light px-6 py-3.5 rounded-rf-lg transition-all shadow-rf-lg">
              Get Early Access
              <ArrowRight className="h-4 w-4" />
            </WaitlistButton>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#9BAABB] hover:text-white px-6 py-3.5 rounded-rf-lg transition-colors border border-[#2A3347] hover:border-[#4A5568]"
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
