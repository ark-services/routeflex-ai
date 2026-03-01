import type { Metadata } from "next";
import Link from "next/link";
import { Check, X, ArrowRight, HelpCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing - RouteFlex",
  description:
    "Simple, transparent pricing for RouteFlex. Plans for solo contractors, growing operations, and enterprise fleets.",
};

const tiers = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "For solo contractors getting started with structured hiring.",
    popular: false,
    features: [
      "1 company",
      "2 active jobs",
      "Basic automations",
      "Application forms",
      "Email support",
    ],
    cta: "Get Started",
  },
  {
    name: "Professional",
    price: "$149",
    period: "/mo",
    description: "For growing operations that need automation and screening.",
    popular: true,
    features: [
      "3 companies",
      "Unlimited jobs",
      "Advanced automations",
      "AI email generation",
      "Background checks (FADV)",
      "Priority support",
    ],
    cta: "Get Started",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large fleets with custom requirements and dedicated support.",
    popular: false,
    features: [
      "Unlimited companies",
      "Unlimited jobs",
      "All automations",
      "AI email generation",
      "Background checks (FADV)",
      "Training & LMS",
      "Dedicated support",
    ],
    cta: "Contact Us",
  },
];

const comparisonFeatures = [
  { name: "Companies", starter: "1", pro: "3", enterprise: "Unlimited" },
  { name: "Active Jobs", starter: "2", pro: "Unlimited", enterprise: "Unlimited" },
  { name: "Applicant Board", starter: true, pro: true, enterprise: true },
  { name: "Application Forms", starter: true, pro: true, enterprise: true },
  { name: "Basic Automations", starter: true, pro: true, enterprise: true },
  { name: "Advanced Automations", starter: false, pro: true, enterprise: true },
  { name: "AI Email Generation", starter: false, pro: true, enterprise: true },
  { name: "Background Checks", starter: false, pro: true, enterprise: true },
  { name: "Training & LMS", starter: false, pro: false, enterprise: true },
  { name: "Custom Integrations", starter: false, pro: false, enterprise: true },
  { name: "Support", starter: "Email", pro: "Priority", enterprise: "Dedicated" },
];

const faqs = [
  {
    question: "Can I switch plans later?",
    answer:
      "Yes, you can upgrade or downgrade your plan at any time. Changes take effect at your next billing cycle.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes! Every plan includes a 14-day free trial. No credit card required to get started.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards and can invoice annually for Enterprise plans.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Absolutely. There are no long-term contracts. Cancel anytime from your account settings.",
  },
];

function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm text-rf-text-primary font-medium">{value}</span>;
  }
  return value ? (
    <Check className="h-4 w-4 text-rf-success mx-auto" />
  ) : (
    <X className="h-4 w-4 text-rf-text-muted mx-auto" />
  );
}

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 bg-rf-surface-page">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-rf-text-primary">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-rf-text-secondary mt-6 max-w-2xl mx-auto leading-relaxed">
            Start free, then pick a plan that grows with your operation. No hidden fees.
          </p>
        </div>
      </section>

      {/* Pricing tiers */}
      <section className="pb-24 bg-rf-surface-page">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-rf-xl border bg-rf-surface-card p-8 flex flex-col ${
                  tier.popular
                    ? "border-rf-blue ring-2 ring-rf-blue shadow-rf-lg"
                    : "border-rf-border"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-xs font-bold text-white bg-rf-blue px-4 py-1 rounded-rf-pill">
                      Most Popular
                    </span>
                  </div>
                )}

                <h3 className="text-xl font-bold text-rf-text-primary">{tier.name}</h3>
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
                <p className="text-sm text-rf-text-secondary mt-2">{tier.description}</p>

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

                <Link
                  href="/signup"
                  className={`mt-8 block text-center text-sm font-bold py-3 rounded-rf-md transition-colors ${
                    tier.popular
                      ? "text-white bg-rf-blue hover:bg-rf-blue-dark"
                      : "text-rf-blue bg-rf-blue-tint hover:bg-rf-blue/10"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-24 bg-rf-surface-card">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-rf-text-primary text-center mb-12">
            Compare Plans
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-rf-border">
                  <th className="text-left text-sm font-semibold text-rf-text-primary py-4 pr-4">
                    Feature
                  </th>
                  <th className="text-center text-sm font-semibold text-rf-text-primary py-4 px-4">
                    Starter
                  </th>
                  <th className="text-center text-sm font-semibold text-rf-blue py-4 px-4">
                    Professional
                  </th>
                  <th className="text-center text-sm font-semibold text-rf-text-primary py-4 pl-4">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((row) => (
                  <tr key={row.name} className="border-b border-rf-border">
                    <td className="text-sm text-rf-text-secondary py-3.5 pr-4">
                      {row.name}
                    </td>
                    <td className="text-center py-3.5 px-4">
                      <FeatureValue value={row.starter} />
                    </td>
                    <td className="text-center py-3.5 px-4">
                      <FeatureValue value={row.pro} />
                    </td>
                    <td className="text-center py-3.5 pl-4">
                      <FeatureValue value={row.enterprise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-rf-surface-page">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-rf-text-primary">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-6">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-rf-lg border border-rf-border bg-rf-surface-card p-6"
              >
                <div className="flex items-start gap-3">
                  <HelpCircle className="h-5 w-5 text-rf-blue flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-rf-text-primary">
                      {faq.question}
                    </h3>
                    <p className="text-sm text-rf-text-secondary mt-2 leading-relaxed">
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
      <section className="py-24 bg-rf-ink-900">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Start Your Free Trial Today
          </h2>
          <p className="text-rf-ink-300 mt-4 max-w-xl mx-auto">
            14 days free. No credit card required. Cancel anytime.
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
