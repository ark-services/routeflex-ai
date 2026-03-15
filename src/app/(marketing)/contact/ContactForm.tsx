"use client";

import { useRef, useState, useTransition } from "react";
import { submitContactForm } from "./actions";
import { Send, CheckCircle2, AlertCircle } from "lucide-react";

export function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { success: true } | { error: string } | null
  >(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitContactForm(formData);
      setResult(res);
      if ("success" in res) {
        formRef.current?.reset();
      }
    });
  }

  if (result && "success" in result) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-400" />
        <h3 className="text-xl font-bold text-rf-text-primary">
          Message sent!
        </h3>
        <p className="text-rf-text-secondary max-w-sm">
          Thanks for reaching out. We&apos;ll get back to you as soon as
          possible.
        </p>
        <button
          onClick={() => setResult(null)}
          className="mt-2 text-sm text-rf-blue hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      {/* Name + Email row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-rf-text-secondary mb-1.5">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="Jane Smith"
            className="w-full px-4 py-3 rounded-rf-lg bg-rf-surface-card border border-rf-border text-rf-text-primary placeholder:text-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/40 focus:border-rf-blue transition"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-rf-text-secondary mb-1.5">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="jane@example.com"
            className="w-full px-4 py-3 rounded-rf-lg bg-rf-surface-card border border-rf-border text-rf-text-primary placeholder:text-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/40 focus:border-rf-blue transition"
          />
        </div>
      </div>

      {/* Company */}
      <div>
        <label className="block text-sm font-medium text-rf-text-secondary mb-1.5">
          Company <span className="text-rf-text-muted text-xs">(optional)</span>
        </label>
        <input
          name="company"
          type="text"
          placeholder="FedEx Ground SP — XYZ Logistics"
          className="w-full px-4 py-3 rounded-rf-lg bg-rf-surface-card border border-rf-border text-rf-text-primary placeholder:text-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/40 focus:border-rf-blue transition"
        />
      </div>

      {/* Message */}
      <div>
        <label className="block text-sm font-medium text-rf-text-secondary mb-1.5">
          Message <span className="text-red-400">*</span>
        </label>
        <textarea
          name="message"
          required
          rows={6}
          placeholder="Tell us how we can help..."
          className="w-full px-4 py-3 rounded-rf-lg bg-rf-surface-card border border-rf-border text-rf-text-primary placeholder:text-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/40 focus:border-rf-blue transition resize-none"
        />
      </div>

      {/* Error */}
      {result && "error" in result && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-rf-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {result.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-rf-lg bg-rf-blue hover:bg-rf-blue-dark text-white font-semibold transition-all shadow-rf-sm hover:shadow-rf-md disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sending…
          </span>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Send Message
          </>
        )}
      </button>
    </form>
  );
}
