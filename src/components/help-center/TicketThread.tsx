"use client";

import { useState } from "react";
import { addTicketMessage } from "@/lib/help-center/actions";
import type { HelpTicketMessage } from "@/lib/help-center/types";
import { Send, Loader2, User, Shield, Bot } from "lucide-react";

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

export function TicketThread({
  ticketId,
  messages: initialMessages,
  ticketStatus,
}: {
  ticketId: string;
  messages: HelpTicketMessage[];
  ticketStatus: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const isClosed = ticketStatus === "closed" || ticketStatus === "resolved";

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || sending) return;

    setSending(true);
    try {
      const msg = await addTicketMessage({
        ticketId,
        senderType: "user",
        senderName: "You",
        body: reply.trim(),
      });
      if (msg) {
        setMessages((prev) => [...prev, msg]);
        setReply("");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {messages.map((msg) => {
        const Icon = senderIcons[msg.sender_type] ?? User;
        const colors = senderColors[msg.sender_type] ?? senderColors.user;

        return (
          <div key={msg.id} className="flex gap-3">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${colors}`}
            >
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
              </div>
              <div className="mt-1 text-sm text-rf-text-secondary whitespace-pre-wrap">
                {msg.body}
              </div>
            </div>
          </div>
        );
      })}

      {/* Reply form */}
      {!isClosed ? (
        <form onSubmit={handleReply} className="mt-6">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Add a reply..."
            className="w-full px-3 py-2.5 text-sm bg-rf-surface-card border border-rf-border rounded-rf-md text-rf-text-primary placeholder-rf-text-muted focus:outline-none focus:ring-2 focus:ring-rf-blue/50 focus:border-rf-blue transition-all resize-y"
          />
          <button
            type="submit"
            disabled={sending || !reply.trim()}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rf-blue hover:bg-rf-blue-dark rounded-rf-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sending ? "Sending..." : "Reply"}
          </button>
        </form>
      ) : (
        <div className="mt-6 p-3 text-center text-sm text-rf-text-muted bg-rf-ink-100/30 rounded-rf-md">
          This ticket has been {ticketStatus}.
        </div>
      )}
    </div>
  );
}
