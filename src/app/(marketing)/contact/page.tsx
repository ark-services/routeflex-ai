import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact — RouteFlex",
  description:
    "Have a question about RouteFlex? Get in touch and we'll get back to you quickly.",
};

export default function ContactPage() {
  return (
    <div className="bg-rf-surface-base min-h-screen">
      {/* Hero */}
      <section className="pt-32 pb-16 px-6 lg:px-10 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rf-blue/10 border border-rf-blue/20 text-rf-blue text-xs font-semibold tracking-wide uppercase mb-6">
            Get in touch
          </div>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-rf-text-primary tracking-tight mb-4">
            We&apos;d love to hear from you
          </h1>
          <p className="text-lg text-rf-text-secondary leading-relaxed">
            Whether you&apos;re curious about features, pricing, or want a demo
            — we&apos;re happy to answer any questions.
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="pb-24 px-6 lg:px-10">
        <div className="max-w-2xl mx-auto bg-rf-surface-card border border-rf-border rounded-rf-xl p-8 shadow-rf-sm">
          <ContactForm />
        </div>
      </section>
    </div>
  );
}
