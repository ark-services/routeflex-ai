import type { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, HelpCircle } from "lucide-react";
import { CostCalculator } from "@/components/marketing/cost-calculator";

export const metadata: Metadata = {
  title: "Pricing - RouteFlex",
  description:
    "Recruiting that pays for itself in week one. Most contractors spend $1,700+/month on agencies. RouteFlex starts at $149/mo.",
};

const tiers = [
  {
    name: "Starter",
    tagline: "Get your pipeline running",
    price: "$149",
    period: "/mo",
    target: "Solo operators, 1 location, 5-15 routes",
    popular: false,
    features: [
      "AI screening, scoring & communication",
      "First Advantage integration",
      "Pre-built workflow templates",
      "Pipeline dashboard (single location)",
      "Knowledge base & AI training",
      "Email support",
    ],
    anchor:
      "Typical agency maintenance fee: $867/mo for 1-2 candidates. RouteFlex handles the same volume at ~80% less.",
    cta: "Start Free Trial",
  },
  {
    name: "Growth",
    tagline: "Scale without the overhead",
    price: "$299",
    period: "/mo",
    target: "1-3 locations, hiring 3-8 drivers/month",
    popular: true,
    features: [
      "Everything in Starter",
      "Multi-location pipeline management",
      "LMS training & onboarding courses",
      "Automated interview scheduling",
      "Seasonal hiring mode (burst capacity)",
      "Priority support",
    ],
    anchor:
      "Typical agency cost: $1,733\u2013$2,383/mo for a single location. RouteFlex covers multiple for a fraction.",
    cta: "Start Free Trial",
  },
  {
    name: "Pro",
    tagline: "Hire through their first day",
    price: "$599",
    period: "/mo",
    target: "3+ locations, high-volume hiring, 8+ drivers/month",
    popular: false,
    features: [
      "Everything in Growth",
      "Unlimited locations & drivers",
      "Advanced analytics & funnel reporting",
      "Custom screening workflows",
      "Full onboarding management (road tests, TSA, HR)",
      "Dedicated support",
    ],
    anchor:
      "3 locations, 10+ drivers/mo with an agency: ~$17,400/mo. RouteFlex Pro: $599/mo.",
    cta: "Start Free Trial",
  },
];

const faqs = [
  {
    question: "Do I still need to pay for Indeed?",
    answer:
      "Yes, you run your own ads. But you\u2019re already doing that. RouteFlex replaces the agency, not the job board. You keep full control of your ad spend.",
  },
  {
    question: "What if I only hire seasonally?",
    answer:
      "Scale up before peak season (July), scale down after. No agency lock-in, no maintenance fees for months you don\u2019t need. Pause or cancel anytime.",
  },
  {
    question: "Can I use this for linehaul AND P&D?",
    answer:
      "Yes. Unlike agencies that charge more per driver, RouteFlex is flat-rate — hire 2 or 20 from one dashboard at no extra cost.",
  },
  {
    question: "What about First Advantage?",
    answer:
      "RouteFlex is fully integrated with FADV. We automatically submit applications, approve background checks, and track status updates in real time. No manual follow-up needed.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes \u2014 every plan includes a 14-day free trial. No credit card required to get started.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Absolutely. No long-term contracts. Cancel anytime from your account settings. Your data stays yours.",
  },
];

export default function PricingPage() {
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
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs font-bold text-rf-blue uppercase tracking-widest mb-4">
            Pricing
          </p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-rf-text-primary">
            Recruiting that pays for itself in week one
          </h1>
          <p className="text-lg text-rf-text-secondary mt-5 max-w-2xl mx-auto leading-relaxed">
            Most contractors spend $1,700+/month on recruiting agencies — per
            location. RouteFlex starts at a fraction of that.
          </p>
        </div>
      </section>

      {/* Cost Calculator */}
      <section className="pb-16 bg-rf-surface-page">
        <div className="max-w-3xl mx-auto px-6">
          <CostCalculator />
        </div>
      </section>

      {/* Pricing tiers */}
      <section className="pb-20 sm:pb-28 bg-rf-surface-page">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-rf-xl border bg-rf-surface-card flex flex-col ${
                  tier.popular
                    ? "border-rf-blue ring-2 ring-rf-blue/20 shadow-rf-lg"
                    : "border-rf-border"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-[10px] font-bold text-white bg-rf-blue px-4 py-1 rounded-rf-pill shadow-rf-sm">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="p-7 sm:p-8 flex-1 flex flex-col">
                  <h3 className="text-lg font-bold text-rf-text-primary">
                    {tier.name}
                  </h3>
                  <p className="text-xs font-semibold text-rf-blue mt-0.5">
                    {tier.tagline}
                  </p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-black text-rf-text-primary tracking-tight">
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-sm font-medium text-rf-text-secondary">
                        {tier.period}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-rf-text-muted mt-1">
                    {tier.target}
                  </p>

                  <hr className="border-rf-border my-6" />

                  <ul className="space-y-3 flex-1">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm text-rf-text-secondary"
                      >
                        <Check className="h-4 w-4 text-rf-success flex-shrink-0 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* Competitor anchor */}
                  <div className="mt-6 rounded-rf-md bg-rf-surface-page border border-rf-border p-3">
                    <p className="text-[11px] text-rf-text-muted leading-relaxed">
                      {tier.anchor}
                    </p>
                  </div>

                  <Link
                    href="/signup"
                    className={`mt-6 block text-center text-sm font-bold py-3 rounded-rf-lg transition-all ${
                      tier.popular
                        ? "text-white bg-rf-blue hover:bg-rf-blue-dark shadow-rf-sm hover:shadow-rf-md"
                        : "text-rf-blue bg-rf-blue-tint hover:bg-rf-blue/10"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-rf-text-muted mt-6">
            All plans include: No long-term contracts &bull; Cancel anytime
            &bull; 14-day free trial &bull; Your data, your candidates
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 sm:py-24 bg-rf-surface-card border-y border-rf-border">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-rf-text-primary">
              Frequently asked questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-rf-xl border border-rf-border bg-rf-surface-page p-6"
              >
                <div className="flex items-start gap-3">
                  <HelpCircle className="h-4 w-4 text-rf-blue flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-rf-text-primary">
                      {faq.question}
                    </h3>
                    <p className="text-sm text-rf-text-secondary mt-1.5 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
            Stop overpaying for recruiting
          </h2>
          <p className="text-[#9BAABB] mt-4 max-w-xl mx-auto leading-relaxed">
            Your pipeline. Your candidates. Your control. Start your free trial
            today.
          </p>
          <div className="mt-10">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-rf-blue hover:bg-rf-blue-light px-6 py-3.5 rounded-rf-lg transition-all shadow-rf-lg"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
