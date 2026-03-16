import Link from "next/link";
import { WaitlistButton } from "@/components/marketing/WaitlistButton";
import { HeroAgentTeamMockup } from "@/components/marketing/HeroAgentTeamMockup";
import { AgentTeamTemplate } from "@/components/marketing/AgentTeamTemplate";
import {
  ArrowRight,
  ArrowDown,
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
  Layers,
  Zap,
} from "lucide-react";
import { CostCalculator } from "@/components/marketing/cost-calculator";

/* ── AI learning accuracy visual ── */
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
          Agent Team Accuracy
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
        Based on your knowledge base and team activity. Accuracy improves as
        your agents learn.
      </p>
    </div>
  );
}

/* ── Data ── */

const problems = [
  {
    icon: Clock,
    title: "Agencies hand you a candidate and walk away.",
    description:
      "They stop at the background check. Road tests, safety training, HR paperwork, TSA processing, Day 1 scheduling — that's all still on you. You're paying for half the job.",
  },
  {
    icon: DollarSign,
    title: "One recruiter. One bottleneck. One invoice.",
    description:
      "A single recruiter juggles every step — and you pay per placement. Need more drivers? The cost scales linearly. But a team of agents scales instantly.",
  },
  {
    icon: AlertCircle,
    title: "Their process never learns your operation.",
    description:
      "Generic pipeline, generic candidates. No memory of who succeeds at your terminals. No improvement cycle. Every hire starts from scratch.",
  },
];

const agentCapabilities = [
  {
    emoji: "🔍",
    name: "Screening",
    description:
      "AI-score every applicant against FedEx requirements and your custom preferences. Send personalized responses. Filter out unqualified candidates instantly.",
  },
  {
    emoji: "🛡️",
    name: "Background Checks",
    description:
      "Auto-submit qualified candidates to First Advantage. Approve background checks automatically. Track status in real time. Send follow-ups when candidates stall.",
  },
  {
    emoji: "✈️",
    name: "TSA Approval",
    description:
      "Track TSA vetting status for every candidate. Send automated nudges. Update the board when clearances come through.",
  },
  {
    emoji: "🎓",
    name: "Safety Training",
    description:
      "Assign courses through the built-in LMS. Track completion rates. Ensure every driver finishes required training before Day 1.",
  },
  {
    emoji: "📋",
    name: "HR Paperwork",
    description:
      "Send and track W-4s, I-9s, direct deposit forms, and every document needed. Answer candidate questions from your knowledge base.",
  },
  {
    emoji: "📅",
    name: "Onboarding",
    description:
      "Schedule road tests and first days. Ensure every step is complete. The candidate shows up prepared. You show up confident.",
  },
  {
    emoji: "📊",
    name: "Reporting",
    description:
      "Pipeline cleanup, status updates, candidate archival. Keep your board organized without lifting a finger.",
  },
];

const howItWorks = [
  {
    num: "01",
    icon: Layers,
    title: "Pick a template or start from scratch",
    description:
      "Deploy a pre-built agent team for P&D, Linehaul, or AVP drivers — or build your own from the ground up. Every agent is customizable.",
  },
  {
    num: "02",
    icon: BookOpen,
    title: "Train your agents",
    description:
      "Add your knowledge base, set screening criteria, customize communications. Your agents learn what works at your operation.",
  },
  {
    num: "03",
    icon: Zap,
    title: "Let them work",
    description:
      "Agents handle the pipeline 24/7. You review results, refine guidance, and watch them improve with every hire.",
  },
];

const aiFeatures = [
  {
    icon: BookOpen,
    title: "Agent Training",
    description:
      "Build a knowledge base that powers your entire team. Pay policies, route details, operation-specific FAQs — your agents use it to screen better and answer candidate questions accurately.",
  },
  {
    icon: TrendingUp,
    title: "Collective Intelligence",
    description:
      "Every agent improves from your hiring patterns. The screener gets better at identifying top candidates. Communications get more natural. The whole team levels up together.",
  },
  {
    icon: Brain,
    title: "Always Improving",
    description:
      "Traditional agencies never learn. Your agents do. They learn what a good hire looks like at your operation — and what a ghost looks like too.",
  },
];

const comparisonRows = [
  {
    feature: "What you get",
    agency: "A recruiter who finds candidates",
    routeflex: "A team of AI agents running your pipeline",
  },
  {
    feature: "Pipeline ends at",
    agency: '"Ready to train"',
    routeflex: "Driver's first day on route",
  },
  {
    feature: "Who manages pipeline",
    agency: "They do",
    routeflex: "Your agents do, with your guidance",
  },
  {
    feature: "First Advantage",
    agency: "Manual processing",
    routeflex: "FADV Agent — fully automated",
  },
  {
    feature: "Screening",
    agency: "Manual, by their team",
    routeflex: "Screener Agent — AI-powered, improves over time",
  },
  {
    feature: "Onboarding & training",
    agency: "Not included",
    routeflex: "HR Agent — built-in LMS, paperwork tracking",
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
    routeflex: "Yes — every agent learns from every hire",
  },
];

const templates = [
  {
    icon: Truck,
    name: "P&D Driver Team",
    agents: 5,
    tasks: 14,
    agentEmojis: ["🔍", "🛡️", "🎓", "📋", "📊"],
    features: [
      "FADV auto-submit",
      "Safety training",
      "Road test scheduling",
      "AI screening",
    ],
  },
  {
    icon: MapPin,
    name: "Linehaul Driver Team",
    agents: 4,
    tasks: 11,
    agentEmojis: ["🔍", "🛡️", "📋", "📊"],
    features: [
      "FADV auto-submit",
      "DOT compliance",
      "CDL verification",
      "AI screening",
    ],
  },
  {
    icon: Package,
    name: "AVP Driver Team",
    agents: 4,
    tasks: 8,
    agentEmojis: ["🔍", "🛡️", "📋", "📊"],
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
  { value: "24/7", label: "Agents always working" },
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
                AI Agents for FedEx Ground Contractors
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-black tracking-tight text-rf-text-primary leading-[1.08]">
                Build your AI{" "}
                <span className="text-rf-blue">recruiting team.</span>
              </h1>

              <p className="text-base sm:text-lg text-rf-text-secondary max-w-lg mt-6 leading-relaxed">
                An agent for every step. A fraction of the cost. Instead of one
                recruiter juggling your entire pipeline, build a team of AI
                agents — each one specialized for a step in the hiring process.
                They work 24/7, and they get smarter every time you hire.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-3 mt-8">
                <Link
                  href="#how-it-works"
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

            {/* Product mockup — agent team */}
            <div className="relative lg:ml-4">
              <div className="absolute -inset-8 bg-rf-blue/5 rounded-[32px] blur-2xl pointer-events-none" />
              <div className="relative">
                <HeroAgentTeamMockup />
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
              You&apos;re paying a recruiter. You should be building a team.
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
          Section 3: THE CONCEPT — Agent Capabilities
          ══════════════════════════════════════════════════════ */}
      <section
        id="agents"
        className="py-20 sm:py-28 bg-rf-surface-page scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <p className="text-xs font-bold text-rf-blue uppercase tracking-widest mb-3">
              Your AI recruiting team
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary">
              An agent for every step in your pipeline.
            </h2>
            <p className="text-rf-text-secondary mt-4 leading-relaxed">
              You decide what agents you need. Give each one a job. They handle
              it from there — screening, background checks, training,
              onboarding, and anything else your pipeline requires.
            </p>
          </div>

          {/* Top row — the steps agencies cover */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {agentCapabilities.slice(0, 3).map((cap) => (
              <div
                key={cap.name}
                className="rounded-rf-xl border border-rf-border bg-rf-surface-card p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-rf-lg bg-rf-blue-tint flex items-center justify-center text-lg">
                    {cap.emoji}
                  </div>
                  <span className="text-sm font-bold text-rf-text-primary uppercase tracking-wide">
                    {cap.name}
                  </span>
                </div>
                <p className="text-sm text-rf-text-secondary leading-relaxed">
                  {cap.description}
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
                Agencies stop here · Your agents keep going
              </span>
            </div>
          </div>

          {/* Bottom row — what only your agents cover */}
          <div className="rounded-rf-2xl border-2 border-rf-blue/20 bg-rf-blue/[0.03] p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {agentCapabilities.slice(3).map((cap) => (
                <div
                  key={cap.name}
                  className="rounded-rf-xl border border-rf-blue/10 bg-rf-surface-card p-5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-rf-md bg-rf-blue flex items-center justify-center text-sm">
                      {cap.emoji}
                    </div>
                    <span className="text-xs font-bold text-rf-text-primary uppercase tracking-wide">
                      {cap.name}
                    </span>
                  </div>
                  <p className="text-xs text-rf-text-secondary leading-relaxed">
                    {cap.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-sm text-rf-text-muted mt-8">
            These are just examples. Build as many agents as your pipeline
            needs — each one customized for your operation.
          </p>

          <div className="mt-10 text-center">
            <WaitlistButton className="inline-flex items-center gap-2 text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-dark px-6 py-3 rounded-rf-lg transition-all shadow-rf-md hover:shadow-rf-lg">
              Get Early Access
              <ArrowRight className="h-4 w-4" />
            </WaitlistButton>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 4: HOW IT WORKS
          ══════════════════════════════════════════════════════ */}
      <section
        id="how-it-works"
        className="py-16 sm:py-24 bg-rf-surface-card border-y border-rf-border scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-bold text-rf-blue uppercase tracking-widest mb-3">
              Getting started
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary">
              Three steps to your own recruiting team.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {howItWorks.map((step) => (
              <div
                key={step.num}
                className="rounded-rf-xl border border-rf-border bg-rf-surface-page p-7"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-rf-lg bg-rf-blue text-white flex items-center justify-center text-sm font-black">
                    {step.num}
                  </div>
                  <div className="w-9 h-9 rounded-rf-md bg-rf-blue-tint flex items-center justify-center">
                    <step.icon className="h-4 w-4 text-rf-blue" />
                  </div>
                </div>
                <h3 className="text-base font-bold text-rf-text-primary mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-rf-text-secondary leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 5: THE AI THAT LEARNS
          ══════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 bg-rf-surface-page">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <p className="text-xs font-bold text-rf-blue uppercase tracking-widest mb-3">
                Continuous improvement
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary">
                Your agents get better. Every single hire.
              </h2>
              <p className="text-rf-text-secondary mt-4 leading-relaxed max-w-lg">
                This isn&apos;t a static tool you configure once. Your agents
                learn from your knowledge base, your hiring patterns, and your
                feedback. Week over week, they screen more accurately and
                communicate more naturally.
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
          Section 6: COST COMPARISON
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
              A recruiting agency gives you one recruiter who stops at the
              background check. RouteFlex gives you a team of AI agents who take
              candidates from application to Day 1.
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
                Your Agent Team
              </span>
            </div>
          </div>

          {/* Comparison rows */}
          <div className="space-y-1.5">
            {comparisonRows.map((row) => (
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
            Your agent team also handles onboarding, training, and Day 1
            management — things agencies don&apos;t offer at any price.
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
          Section 7: PRE-BUILT AGENT TEAMS
          ══════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-20 bg-rf-surface-card border-y border-rf-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-bold text-rf-blue uppercase tracking-widest mb-3">
              Quick start
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-rf-text-primary">
              Go live in minutes.
            </h2>
            <p className="text-rf-text-secondary mt-4 leading-relaxed">
              Deploy a pre-built agent team with proven workflows and
              automations. Or build your own team from scratch — add as many
              agents as your pipeline needs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {templates.map((tmpl) => (
              <AgentTeamTemplate key={tmpl.name} {...tmpl} />
            ))}
          </div>

          <p className="text-xs text-rf-text-muted mt-6 text-center">
            Or build your own team from scratch — add as many agents as your
            pipeline needs.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          Section 8: SOCIAL PROOF
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
            &ldquo;We went from paying an agency $3,400 a month to having our
            own AI team managing the whole pipeline — from Indeed ad to first day
            on the road. RouteFlex paid for itself in the first week.&rdquo;
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
          Section 9: FINAL CTA
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
            Ready to build your recruiting team?
          </h2>
          <p className="text-[#9BAABB] mt-4 max-w-xl mx-auto leading-relaxed">
            No recruiter fees. No contracts. No exclusivity. Your agents start
            working the moment you deploy them.
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
