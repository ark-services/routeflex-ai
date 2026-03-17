import { getTicket } from "@/lib/help-center/actions";
import { Chatbot } from "@/components/help-center/Chatbot";
import { TicketThread } from "@/components/help-center/TicketThread";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";

const statusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600",
  in_progress: "bg-yellow-500/10 text-yellow-600",
  resolved: "bg-green-500/10 text-green-600",
  closed: "bg-rf-ink-100/50 text-rf-text-muted",
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const result = await getTicket(ticketId);

  if (!result) notFound();

  const { ticket, messages } = result;

  return (
    <>
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-rf-text-muted mb-6">
          <Link
            href="/help-center"
            className="hover:text-rf-text-secondary transition-colors"
          >
            Help Center
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            href="/help-center/tickets"
            className="hover:text-rf-text-secondary transition-colors"
          >
            Tickets
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-rf-text-secondary font-medium">
            #{ticket.ticket_number}
          </span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-rf-text-primary">
              {ticket.subject}
            </h1>
            <p className="mt-1 text-xs text-rf-text-muted">
              Submitted by {ticket.name} on{" "}
              {new Date(ticket.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
          <span
            className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
              statusColors[ticket.status] ?? statusColors.open
            }`}
          >
            {statusLabels[ticket.status] ?? ticket.status}
          </span>
        </div>

        {/* Thread */}
        <div className="mt-8">
          <TicketThread
            ticketId={ticket.id}
            messages={messages}
            ticketStatus={ticket.status}
          />
        </div>
      </div>

      <Chatbot />
    </>
  );
}
