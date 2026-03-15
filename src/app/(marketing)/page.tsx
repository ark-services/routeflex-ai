import Link from "next/link";
import { WaitlistButton } from "@/components/marketing/WaitlistButton";
import {
  ArrowRight,
  ArrowDown,
  Inbox,
  Bot,
  ShieldCheck,
  GraduationCap,
  Calendar,
  DollarSign,
  Clock,
  Brain,
  Check,
  Quote,
  Truck,
  MapPin,
  Package,
  BookOpen,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { CostCalculator } from "@/components/marketing/cost-calculator";

/* ── Hero: Full-pipeline mockup ── */
function HeroPipelineMockup() {
  return (
    <div className="rounded-rf-xl border border-rf-border bg-rf-surface-card shadow-rf-xl overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-rf-border bg-rf-surface-page">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rf-ink-100" />
          <div className="w-2.5 h-2.5 rounded-full bg-rf-ink-100" />
          <div className="w-2.5 h-2.5 rounded-full bg-rf-ink-100" />
        </div>
        <div className="flex-1 mx-3">
          <div className="bg-rf-surface-card rounded-rf-md border border-rf-border px-3 py-1 text-[10px] font-mono text-rf-text-muted text-center">
            app.routeflex.ai/pipeline
          </div>
        </div>
      </div>

      <div className="p-4 bg-rf-surface-page">
        {/* Pipeline funnel — shows the full 5-stage journey */}
        <div className="flex gap-2 mb-4">
          {[
            { name: "Applied", count: 8, color: "bg-rf-ink-300" },
            { name: "Screened", count: 5, color: "bg-[#D97706]" },
            { name: "FADV", count: 3, color: "bg-[#16A34A]" },
            { name: "Training", count: 2, color: "bg-rf-blue" },
            { name: "Day 1", count: 1, color: "bg-rf-blue" },
          ].map((s) => (
            <div key={s.name} className="flex-1 text-center">
              <div className={`h-1 rounded-full ${s.color} mb-1.5`} />
              <div className="text-sm font-black text-rf-text-primary">
                {s.count}
              </div>
              <div className="text-[8px] font-mono text-rf-text-muted uppercase tracking-wider">
                {s.name}
              </div>
            </div>
          ))}
        </div>

        {/* Candidate journey tracker */}
        <div className="rounded-rf-lg bg-rf-surface-card border border-rf-border p-3 mb-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-rf-md bg-rf-blue-tint flex items-center justify-center text-[9px] font-bold text-rf-blue">
              DP
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-rf-text-primary">
                Diana Patel · CDL-A
              </div>
            </div>
            <span className="text-[9px] font-mono text-rf-success bg-rf-success-bg px-2 py-0.5 rounded-rf-pill">
              Stage 4/5
            </span>
          </div>
          <div className="flex gap-0.5">
            {[
              { label: "Applied", done: true },
              { label: "Screened", done: true },
              { label: "FADV Clear", done: true },
              { label: "Training", active: true },
              { label: "Day 1", done: false },
            ].map((stage) => (
              <div key={stage.label} className="flex-1">
                <div
                  className={`h-1.5 rounded-full ${
                    stage.done
                      ? "bg-rf-blue"
                      : stage.active
                        ? "bg-rf-blue/40"
                        : "bg-rf-ink-100"
                  }`}
                />
                <div className="text-[7px] font-mono text-rf-text-muted mt-1 text-center truncate">
                  {stage.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live activity feed */}
        <div className="space-y-1.5">
          {[
            {
              text: "Safety training assigned to Diana Patel",
              time: "now",
              dot: "bg-rf-blue",
            },
            {
              text: "AI screened 4 applicants — 2 qualified",
              time: "2m",
              dot: "bg-[#D97706]",
            },
            {
              text: "Tom Lee auto-submitted to FADV",
              time: "15m",
              dot: "bg-[#16A34A]",
            },
          ].map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-2 text-[10px]"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${item.dot} flex-shrink-0`}
              />
              <span className="text-rf-text-secondary flex-1 truncate">
                {item.text}
              </span>
              <span className="text-rf-text-muted font-mono flex-shrink-0">
                {item.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Section 4: AI learning accuracy visual ── */
function AILearningVisual() {
  const weeks = [
    { label: "Week 1", value: 82 },
    { label: "Week 4", value: 89 },
    { label: "Week 8", value: 94 },
    { label: "Week 12", value: 97 },
  ];

  return (
    <div className="rounded-rf-xl border border-rf-border bg-rf-surface-page p-6 shadow-rf-sm">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="h-4 w-4 text-rf-blue" />
        <span className="text-xs font-bold text-rf-text-primary">
          Screening Accuracy
        </span>
        <span className="text-[10px] font-mono text-rf-success bg-rf-success-bg px-2 py-0.5 rounded-rf-pill ml-auto">
          Improving
        </span>
      </div>
      <div className="space-y-4">
        {weeks.map((w) => (
          <div key={w.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono text-rf-text-muted">
                {w.label}
              </span>
              <span className="text-xs font-bold text-rf-blue">{w.value}%</span>
            </div>
            <div className="h-2 bg-rf-ink-100/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-rf-blue rounded-full"
                style={{ width: `${w.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-rf-text-muted mt-5 leading-relaxed">
        Based on your knowledge base and hiring patterns. Accuracy improves as
        you hire.
      </p>
    </div>
  );
}

/* ── Data ── */

const problems = [
  {
    icon: Clock,
    title: "They stop at \"ready to train.\"",
    description:
      "Agencies hand off a candidate who cleared a background check. Road tests, safety training, HR paperwork, TSA processing, scheduling Day 1 — that's all still on you.",
  },
  {
    icon: DollarSign,
    title: "They charge more the more you hire.",
    description:
      "Need 10 drivers this month instead of 3? Your agency bill doubles. Running 2 terminals? Double it again. You're penalized for growing.",
  },
  {
    icon: AlertCircle,
    title: "Their process never gets better.",
    description:
      "Every candidate goes through the same generic pipeline. No learning. No improvement. No intelligence behind who actually succeeds at your operation.",
  },
];

const pipelineStages = [
  {
    num: "01",
    label: "Capture",
    icon: Inbox,
    description:
      "Candidates apply through your Indeed ad and land directly in RouteFlex. Smart intake forms collect license type, availability, commute range, and experience.",
  },
  {
    num: "02",
    label: "Screen",
    icon: Bot,
    description:
      "AI scores and qualifies every applicant instantly — checking against FedEx requirements and your custom preferences. Sends texts, emails, and answers questions automatically.",
  },
  {
    num: "03",
    label: "First Advantage",
    icon: ShieldCheck,
    description:
      "Qualified candidates are auto-submitted to FADV. Background checks approved automatically. Status updates flow into your dashboard in real time.",
  },
  {
    num: "04",
    label: "Onboard",
    icon: GraduationCap,
    description:
      "Schedule road tests. Assign safety training through the built-in LMS. Track HR paperwork. Manage TSA processing. Everything to get route-ready.",
  },
  {
    num: "05",
    label: "Day 1",
    icon: Calendar,
    description:
      "Schedule their first day. Every step tracked and visible. The candidate shows up prepared. You show up confident.",
  },
];

const aiFeatures = [
  {
    icon: BookOpen,
    title: "Knowledge Base",
    description:
      "Build a knowledge base specific to your operation. The AI uses it to screen better, answer candidate questions, and match candidates to your actual needs.",
  },
  {
    icon: TrendingUp,
    title: "Pattern Recognition",
    description:
      "The more applicants interact with your pipeline, the better the AI gets at identifying who'll succeed — and who'll ghost.",
  },
  {
    icon: Brain,
    title: "Your Hiring Agent",
    description:
      "RouteFlex learns what a good hire looks like at your operation. Not a one-size-fits-all tool — a hiring agent that improves every cycle.",
  },
];

const comparisonRows = [
  {
    feature: "What you get",
    agency: "A recruiter who finds candidates",
    routeflex: "An AI platform that runs your hiring pipeline",
  },
  {
    feature: "Pipeline ends at",
    agency: '"Ready to train"',
    routeflex: "Driver's first day on route",
  },
  {
    feature: "Who controls pipeline",
    agency: "They do",
    routeflex: "You do",
  },
  {
    feature: "First Advantage",
    agency: "Manual processing",
    routeflex: "Fully automated — submit, approve, track",
  },
  {
    feature: "Screening",
    agency: "Manual, by their team",
    routeflex: "AI-powered, improves over time",
  },
  {
    feature: "Onboarding & training",
    agency: "Not included",
    routeflex: "Built-in LMS, HR, road tests",
  },
  {
    feature: "Monthly cost",
    agency: "$1,733–$2,925+ per location",
    routeflex: "Flat rate, all locations",
  },
  {
    feature: "Exclusivity",
    agency: "Required",
    routeflex: "Never",
  },
  {
    feature: "Gets smarter",
    agency: "No",
    routeflex: "Yes — learns your patterns",
  },
];

const templates = [
  {
    icon: Truck,
    name: "P&D Driver",
    stages: 5,
    automations: 14,
    features: [
      "FADV auto-submit",
      "Safety training",
      "Road test scheduling",
      "AI screening",
    ],
  },
  {
    icon: MapPin,
    name: "Linehaul Driver",
    stages: 4,
    automations: 11,
    features: [
      "FADV auto-submit",
      "DOT compliance",
      "CDL verification",
      "AI screening",
    ],
  },
  {
    icon: Package,
    name: "AVP Driver",
    stages: 4,
    automations: 8,
    features: [
      "Background check",
      "Vehicle verification",
      "HR paperwork",
      "AI screening",
    ],
  },
];

const metrics = [
  { value: "91%", label: "Less than agency cost" },
  { value: "15+", label: "Hours saved per month" },
  { value: "<24hr", label: "Avg. time to screen" },
  { value: "0", label: "Lock-in contracts" },
];

export default function LandingPage() {
  return (
    <>
      {/* ══════════════════════════════════════════════════════
          Section 1: HERO
          ══════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24 lg:pt-40 lg:pb-28">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-rf-pill bg-rf-blue-tint text-rf-blue text-xs font-bold tracking-wide uppercase mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-rf-blue" />
                Built for FedEx Ground Contractors
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-black tracking-tight text-rf-text-primary leading-[1.08]">
                From application to first day.{" "}
                <span className="text-rf-blue">No recruiter required.</span>
              </h1>

              <p className="text-lg text-rf-text-secondary max-w-lg mt-6 leading-relaxed">
                RouteFlex is the AI hiring platform for FedEx contractors.
                Screen applicants, automate First Advantage, manage training and
                onboarding — from one dashboard that gets smarter every time you
                hire.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-3 mt-8">
                <Link
                  href="#pipeline"
                  className="inline-flex items-center gap-2 text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-dark px-6 py-3.5 rounded-rf-lg transition-all shadow-rf-md hover:shadow-rf-lg"
                >
                  See How It Works
                  <ArrowDown className="h-4 w-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-rf-text-secondary hover:text-rf-text-primary px-6 py-3.5 rounded-rf-lg transition-colors border border-rf-border hover:border-rf-ink-300 bg-rf-surface-card"
                >
                  View Pricing
                </Link>
              </div>
            </div>

            {/* Product mockup — full pipeline */}
            <div className="relative lg:ml-4">
              <div className="absolute -inset-8 bg-rf-blue/5 rounded-[32px] blur-2xl pointer-events-none" />
              <div className="relative">
                <HeroPipelineMockup />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 2: THE PROBLEM
          ══════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 bg-rf-surface-card border-y border-rf-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="max-w-3xl mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary">
              Recruiting agencies solve half the problem and charge you for the
              whole thing
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {problems.map((problem) => (
              <div
                key={problem.title}
                className="rounded-rf-xl border border-rf-border bg-rf-surface-page p-7"
              >
                <div className="w-10 h-10 rounded-rf-lg bg-rf-danger-bg flex items-center justify-center mb-4">
                  <problem.icon className="h-5 w-5 text-rf-danger" />
                </div>
                <h3 className="text-base font-bold text-rf-text-primary mb-2">
                  {problem.title}
                </h3>
                <p className="text-sm text-rf-text-secondary leading-relaxed">
                  {problem.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 3: THE PIPELINE (Centerpiece)
          5-stage journey with "Agencies stop here" divider
          ══════════════════════════════════════════════════════ */}
      <section
        id="pipeline"
        className="py-20 sm:py-28 bg-rf-surface-page scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <p className="text-xs font-bold text-rf-blue uppercase tracking-widest mb-3">
              The full journey
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary">
              One platform. Application to Day 1.
            </h2>
            <p className="text-rf-text-secondary mt-4 leading-relaxed">
              Watch a candidate move through your entire hiring pipeline — from
              Indeed application to their first day on a route.
            </p>
          </div>

          {/* Stages 1–3: what agencies cover */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {pipelineStages.slice(0, 3).map((stage) => (
              <div
                key={stage.num}
                className="rounded-rf-xl border border-rf-border bg-rf-surface-card p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-rf-lg bg-rf-blue-tint flex items-center justify-center">
                    <stage.icon className="h-4 w-4 text-rf-blue" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-rf-text-muted block">
                      {stage.num}
                    </span>
                    <span className="text-sm font-bold text-rf-text-primary uppercase tracking-wide">
                      {stage.label}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-rf-text-secondary leading-relaxed">
                  {stage.description}
                </p>
              </div>
            ))}
          </div>

          {/* ── Agencies stop here divider ── */}
          <div className="relative my-10">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-dashed border-rf-ink-300" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-rf-surface-page px-5 py-2 rounded-rf-pill text-[11px] font-bold uppercase tracking-wider text-rf-text-muted border border-rf-border">
                Agencies stop here · RouteFlex keeps going
              </span>
            </div>
          </div>

          {/* Stages 4–5: only RouteFlex — highlighted */}
          <div className="rounded-rf-2xl border-2 border-rf-blue/20 bg-rf-blue/[0.03] p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {pipelineStages.slice(3).map((stage) => (
                <div
                  key={stage.num}
                  className="rounded-rf-xl border border-rf-blue/10 bg-rf-surface-card p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-rf-lg bg-rf-blue flex items-center justify-center">
                      <stage.icon className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-rf-blue block">
                        {stage.num}
                      </span>
                      <span className="text-sm font-bold text-rf-text-primary uppercase tracking-wide">
                        {stage.label}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-rf-text-secondary leading-relaxed">
                    {stage.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 text-center">
            <WaitlistButton className="inline-flex items-center gap-2 text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-dark px-6 py-3 rounded-rf-lg transition-all shadow-rf-md hover:shadow-rf-lg">
              Get Early Access
              <ArrowRight className="h-4 w-4" />
            </WaitlistButton>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 4: THE AI THAT LEARNS
          ══════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 bg-rf-surface-card border-y border-rf-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <p className="text-xs font-bold text-rf-blue uppercase tracking-widest mb-3">
                Adaptive AI
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary">
                An AI hiring agent that gets smarter every time you hire
              </h2>
              <p className="text-rf-text-secondary mt-4 leading-relaxed max-w-lg">
                Not a static chatbot. Not a generic screening tool. A hiring
                agent trained on your operation that improves with every
                candidate.
              </p>

              <div className="mt-8 space-y-6">
                {aiFeatures.map((feature) => (
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

            <div>
              <AILearningVisual />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 5: COST COMPARISON
          ══════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 bg-[#0B1120] relative overflow-hidden">
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#4B8EF0 1px, transparent 1px), linear-gradient(90deg, #4B8EF0 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Blue glow top-center */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-rf-blue/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 lg:px-10">
          {/* Header */}
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-rf-blue mb-5">
              The real cost comparison
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              <span className="text-[#64748B] line-through decoration-red-500/60 decoration-2">
                $1,700+/mo
              </span>{" "}
              <span className="text-[#475569]">vs.</span>{" "}
              <span className="text-rf-blue">$149/mo</span>
            </h2>
            <p className="text-[#9BAABB] mt-4 max-w-xl mx-auto leading-relaxed">
              Agencies charge per location, require exclusivity, and stop at
              background checks. Here&apos;s what you actually get.
            </p>
          </div>

          {/* Column labels */}
          <div className="grid grid-cols-[1.1fr_1fr_1fr] gap-3 mb-3 px-1">
            <div />
            <div className="flex items-center gap-2 px-4">
              <div className="w-2 h-2 rounded-full bg-red-500/50 flex-shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#475569]">
                Agency Model
              </span>
            </div>
            <div className="flex items-center gap-2 px-4">
              <div className="w-2 h-2 rounded-full bg-rf-blue flex-shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-rf-blue">
                RouteFlex
              </span>
            </div>
          </div>

          {/* Comparison rows */}
          <div className="space-y-1.5">
            {comparisonRows.map((row, i) => (
              <div
                key={row.feature}
                className="grid grid-cols-[1.1fr_1fr_1fr] gap-0 rounded-xl overflow-hidden"
              >
                {/* Feature label */}
                <div className="flex items-center px-4 py-3.5 bg-[#111827] border border-[#1E2A3A]">
                  <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                    {row.feature}
                  </span>
                </div>
                {/* Agency value */}
                <div className="flex items-center px-4 py-3.5 bg-[#0E1420] border-y border-r border-[#1E2A3A]">
                  <span className="text-sm text-[#475569]">{row.agency}</span>
                </div>
                {/* RouteFlex value */}
                <div className="flex items-center gap-2.5 px-4 py-3.5 bg-[#0A1628] border-y border-r border-rf-blue/20 relative">
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-rf-blue/40" />
                  <Check className="w-3.5 h-3.5 text-rf-blue flex-shrink-0" />
                  <span className="text-sm font-medium text-white">
                    {row.routeflex}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Cost calculator */}
          <div className="mt-14">
            <CostCalculator />
          </div>
          <p className="text-center text-xs text-[#4A5568] mt-4 max-w-xl mx-auto">
            RouteFlex also includes onboarding, training, and Day 1 management —
            which agencies don&apos;t offer at any price.
          </p>

          <div className="mt-10 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-dark px-6 py-3.5 rounded-rf-lg transition-all shadow-rf-md hover:shadow-rf-lg"
            >
              See Full Pricing
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 6: TEMPLATES & QUICK START
          ══════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-20 bg-rf-surface-card border-y border-rf-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-rf-blue uppercase tracking-widest mb-3">
              Quick start
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary">
              Go live in minutes, not weeks
            </h2>
            <p className="text-rf-text-secondary mt-4 leading-relaxed">
              Pick a pre-built template with proven workflows and automations. Or
              build from scratch. No waiting for a recruiter to onboard you.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {templates.map((tmpl) => (
              <div
                key={tmpl.name}
                className="group rounded-rf-xl border border-rf-border bg-rf-surface-page p-6 hover:shadow-rf-md hover:border-rf-blue/30 transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-rf-lg bg-rf-blue-tint flex items-center justify-center mb-4 group-hover:bg-rf-blue transition-colors">
                  <tmpl.icon className="h-5 w-5 text-rf-blue group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-base font-bold text-rf-text-primary mb-1">
                  {tmpl.name}
                </h3>
                <div className="flex gap-3 text-[11px] font-mono text-rf-text-muted mb-4">
                  <span>{tmpl.stages} stages</span>
                  <span>·</span>
                  <span>{tmpl.automations} automations</span>
                </div>
                <ul className="space-y-1.5 mb-5">
                  {tmpl.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-xs text-rf-text-secondary"
                    >
                      <Check className="h-3 w-3 text-rf-success flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="text-xs font-bold text-rf-blue group-hover:text-rf-blue-dark flex items-center gap-1 transition-colors">
                  Use Template <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-rf-text-muted mt-6 text-center">
            Want full control? Build your workspace from scratch with custom
            stages, automations, and rules.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 7: SOCIAL PROOF
          ══════════════════════════════════════════════════════ */}

      {/* Metrics strip */}
      <section className="border-b border-rf-border bg-rf-surface-page">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-rf-border">
            {metrics.map((m) => (
              <div key={m.label} className="py-8 md:py-10 px-6 text-center">
                <div className="text-2xl sm:text-3xl font-black text-rf-text-primary tracking-tight">
                  {m.value}
                </div>
                <div className="text-xs font-semibold text-rf-text-muted uppercase tracking-wider mt-1">
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16 sm:py-24 bg-rf-surface-page">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 text-center">
          <Quote className="h-8 w-8 text-rf-blue/20 mx-auto mb-6" />
          <blockquote className="text-xl sm:text-2xl font-semibold text-rf-text-primary leading-relaxed tracking-tight">
            &ldquo;We went from paying an agency $3,400 a month to managing the
            whole pipeline ourselves — from Indeed ad to first day on the road.
            RouteFlex paid for itself in the first week.&rdquo;
          </blockquote>
          <div className="mt-6">
            <p className="text-sm font-bold text-rf-text-primary">
              Marcus Rivera
            </p>
            <p className="text-xs text-rf-text-muted mt-0.5">
              Operations Manager — FedEx Ground ISP, Portland OR
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 8: FINAL CTA
          ══════════════════════════════════════════════════════ */}
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
            Ready to own your hiring pipeline?
          </h2>
          <p className="text-[#9BAABB] mt-4 max-w-xl mx-auto leading-relaxed">
            No long-term contracts. No exclusivity. Cancel anytime. Your data
            stays yours.
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
