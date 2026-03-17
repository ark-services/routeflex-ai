"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTicket } from "@/lib/help-center/actions";
import { Send, Loader2, CheckCircle } from "lucide-react";

export function TicketForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const result = await createTicket({
        name: formData.get("name") as string,
        email: formData.get("email") as string,
        subject: formData.get("subject") as string,
        description: formData.get("description") as string,
        priority: formData.get("priority") as string,
      });

      if (result.error) {
        setError(result.error);
      } else if (result.ticket) {
        setTicketId(result.ticket.id);
        setSubmitted(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted && ticketId) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-green-500/10 mb-4">
          <CheckCircle className="h-7 w-7 text-green-500" />
        </div>
        <h2 className="text-lg font-semibold text-rf-text-primary">
          Ticket Submitted!
        </h2>
        <p className="mt-2 text-sm text-rf-text-secondary max-w-md mx-auto">
          We&apos;ve received your support request and will get back to you
          shortly. You can track your ticket status below.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            onClick={() => router.push(`/help-center/tickets/${ticketId}`)}
            className="text-sm font-medium text-rf-blue hover:text-rf-blue-dark transition-colors"
          >
            View Ticket Status
          </button>
          <button
            onClick={() => {
              setSubmitted(false);
              setTicketId(null);
            }}
            className="text-sm text-rf-text-muted hover:text-rf-text-secondary transition-colors"
          >
            Submit Another Ticket
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-rf-md text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-rf-text-primary mb-1.5">
            Name
          </label>
          <input
            name="name"
            type="text"
            required
            className="w-full px-3 py-2.5 text-sm bg-rf-surface-card border border-rf-border rounded-rf-md text-rf-text-primary placeholder-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/50 focus:border-rf-blue transition-all"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-rf-text-primary mb-1.5">
            Email
          </label>
          <input
            name="email"
            type="email"
            required
            className="w-full px-3 py-2.5 text-sm bg-rf-surface-card border border-rf-border rounded-rf-md text-rf-text-primary placeholder-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/50 focus:border-rf-blue transition-all"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-rf-text-primary mb-1.5">
          Subject
        </label>
        <input
          name="subject"
          type="text"
          required
          className="w-full px-3 py-2.5 text-sm bg-rf-surface-card border border-rf-border rounded-rf-md text-rf-text-primary placeholder-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/50 focus:border-rf-blue transition-all"
          placeholder="Brief summary of your issue"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-rf-text-primary mb-1.5">
          Priority
        </label>
        <select
          name="priority"
          defaultValue="medium"
          className="w-full px-3 py-2.5 text-sm bg-rf-surface-card border border-rf-border rounded-rf-md text-rf-text-primary focus:outline-none focus:ring-2 focus:ring-rf-blue/50 focus:border-rf-blue transition-all"
        >
          <option value="low">Low - General question</option>
          <option value="medium">Medium - Something isn&apos;t working right</option>
          <option value="high">High - Blocking issue</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-rf-text-primary mb-1.5">
          Description
        </label>
        <textarea
          name="description"
          required
          rows={6}
          className="w-full px-3 py-2.5 text-sm bg-rf-surface-card border border-rf-border rounded-rf-md text-rf-text-primary placeholder-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/50 focus:border-rf-blue transition-all resize-y"
          placeholder="Describe your issue in detail. Include steps to reproduce, what you expected, and what actually happened."
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-rf-blue hover:bg-rf-blue-dark rounded-rf-lg transition-all shadow-rf-sm hover:shadow-rf-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {submitting ? "Submitting..." : "Submit Ticket"}
      </button>
    </form>
  );
}
