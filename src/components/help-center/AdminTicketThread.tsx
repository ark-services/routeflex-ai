"use client";

import { useState } from "react";
import { adminReplyToTicket, updateTicketStatus } from "@/lib/help-center/actions";
import type { HelpTicket, HelpTicketMessage, TicketStatus } from "@/lib/help-center/types";
import { Send, Loader2, User, Shield, Bot, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

const senderIcons = {
  user: User,
  admin: Shield,
  system: Bot,
};

const senderColors = {
  user: "bg-rf-blue/10 text-rf-blue",
  admin: "bg-green-500/10 text-green-600",
  system: "bg-rf-ink-100/50 text-rf-text-muted",
};

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const statusStyles: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-yellow-50 text-yellow-700 border-yellow-200",
  resolved: "bg-green-50 text-green-700 border-green-200",
  closed: "bg-rf-ink-100/50 text-rf-text-muted border-rf-border",
};

export function AdminTicketThread({
  ticket: initialTicket,
  messages: initialMessages,
}: {
  ticket: HelpTicket;
  messages: HelpTicketMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [ticket, setTicket] = useState(initialTicket);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setError(null);
    setSending(true);
    try {
      const { message, error: err } = await adminReplyToTicket({
        ticketId: ticket.id,
        senderName: "Support Team",
        body: reply.trim(),
      });
      if (err) {
        setError(err);
      } else if (message) {
        setMessages((prev) => [...prev, message]);
        setReply("");
        // Update local status if it moved to in_progress
        if (ticket.status === "open") {
          setTicket((t) => ({ ...t, status: "in_progress" }));
        }
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(newStatus: TicketStatus) {
    setStatusOpen(false);
    if (newStatus === ticket.status) return;
    setStatusUpdating(true);
    try {
      const { error: err } = await updateTicketStatus(ticket.id, newStatus);
      if (!err) {
        setTicket((t) => ({ ...t, status: newStatus }));
        router.refresh();
      }
    } finally {
      setStatusUpdating(false);
    }
  }

  const isClosed = ticket.status === "closed" || ticket.status === "resolved";

  return (
    <div className="space-y-6">
      {/* Status control */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-rf-text-secondary">Status:</span>
        <div className="relative">
          <button
            onClick={() => setStatusOpen((o) => !o)}
            disabled={statusUpdating}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${statusStyles[ticket.status] ?? ""}`}
          >
            {statusUpdating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            {STATUS_OPTIONS.find((s) => s.value === ticket.status)?.label ?? ticket.status}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {statusOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 bg-rf-surface-card border border-rf-border rounded-lg shadow-lg py-1 min-w-[140px]">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-rf-surface-page transition-colors ${
                    opt.value === ticket.status ? "font-medium text-rf-text-primary" : "text-rf-text-secondary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((msg) => {
          const Icon = senderIcons[msg.sender_type] ?? User;
          const colors = senderColors[msg.sender_type] ?? senderColors.user;

          return (
            <div key={msg.id} className="flex gap-3">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${colors}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-rf-text-primary">
                    {msg.sender_name ?? msg.sender_type}
                  </span>
                  <span className="text-xs text-rf-text-muted">
                    {new Date(msg.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  {msg.sender_type === "admin" && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                      Admin
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-rf-text-secondary whitespace-pre-wrap">
                  {msg.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply form */}
      {!isClosed ? (
        <form onSubmit={handleReply} className="border-t border-rf-border pt-5">
          <label className="block text-sm font-medium text-rf-text-primary mb-2">
            Reply as Support Team
          </label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder="Write a reply..."
            className="w-full px-3 py-2.5 text-sm bg-rf-surface-card border border-rf-border rounded-rf-md text-rf-text-primary placeholder-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/50 focus:border-rf-blue transition-all resize-y"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rf-blue hover:bg-rf-blue-dark rounded-rf-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending..." : "Send Reply"}
            </button>
            <p className="text-xs text-rf-text-muted">Reply will also be posted to Slack thread if connected.</p>
          </div>
        </form>
      ) : (
        <div className="border-t border-rf-border pt-5 p-3 text-center text-sm text-rf-text-muted bg-rf-ink-100/30 rounded-rf-md">
          This ticket is {ticket.status}. Change the status above to reopen it.
        </div>
      )}
    </div>
  );
}
