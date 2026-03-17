import { getTicket } from "@/lib/help-center/actions";
import { AdminTicketThread } from "@/components/help-center/AdminTicketThread";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

const priorityStyles: Record<string, string> = {
  low: "text-rf-text-muted",
  medium: "text-yellow-600",
  high: "text-red-600 font-semibold",
};

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const result = await getTicket(ticketId);

  if (!result) notFound();

  const { ticket, messages } = result;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-rf-text-muted">
        <Link href="/super-admin/help-center" className="hover:text-rf-text-secondary transition-colors">
          Help Center
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/super-admin/help-center/tickets" className="hover:text-rf-text-secondary transition-colors">
          Tickets
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-rf-text-secondary font-medium">#{ticket.ticket_number}</span>
      </nav>

      {/* Ticket header */}
      <div className="bg-rf-surface-card border border-rf-border rounded-lg p-5">
        <h1 className="text-lg font-semibold text-rf-text-primary">{ticket.subject}</h1>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-rf-text-muted shrink-0">From:</dt>
            <dd className="text-rf-text-primary font-medium">
              {ticket.name}{" "}
              <a
                href={`mailto:${ticket.email}`}
                className="text-rf-text-muted font-normal hover:text-rf-blue transition-colors"
              >
                {ticket.email}
              </a>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-rf-text-muted shrink-0">Priority:</dt>
            <dd className={`capitalize ${priorityStyles[ticket.priority] ?? ""}`}>
              {ticket.priority}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-rf-text-muted shrink-0">Submitted:</dt>
            <dd className="text-rf-text-secondary">
              {new Date(ticket.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </dd>
          </div>
          {ticket.slack_ts && (
            <div className="flex gap-2">
              <dt className="text-rf-text-muted shrink-0">Slack:</dt>
              <dd className="text-rf-text-secondary text-xs font-mono">thread linked</dd>
            </div>
          )}
        </dl>

        {/* Link to user-facing ticket */}
        <div className="mt-4 pt-4 border-t border-rf-border">
          <Link
            href={`/help-center/tickets/${ticket.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-xs text-rf-text-muted hover:text-rf-blue transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View user-facing ticket page
          </Link>
        </div>
      </div>

      {/* Thread */}
      <div className="bg-rf-surface-card border border-rf-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-rf-text-primary mb-5">Conversation</h2>
        <AdminTicketThread ticket={ticket} messages={messages} />
      </div>
    </div>
  );
}
