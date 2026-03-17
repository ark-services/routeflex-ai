import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { HelpTicket, TicketStatus } from "@/lib/help-center/types";

const STATUS_TABS: { value: TicketStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
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

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const priorityStyles: Record<string, string> = {
  low: "text-rf-text-muted",
  medium: "text-yellow-600",
  high: "text-red-600",
};

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = (status ?? "all") as TicketStatus | "all";

  const supabase = createServiceClient();

  let query = supabase
    .from("help_tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (activeStatus !== "all") {
    query = query.eq("status", activeStatus);
  }

  const { data: tickets } = await query;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-rf-text-muted mb-2">
          <Link href="/super-admin/help-center" className="hover:text-rf-text-secondary transition-colors">
            Help Center
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-rf-text-secondary font-medium">Tickets</span>
        </nav>
        <h1 className="text-xl font-semibold text-rf-text-primary">Support Tickets</h1>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-rf-border">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "all" ? "/super-admin/help-center/tickets" : `/super-admin/help-center/tickets?status=${tab.value}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeStatus === tab.value
                ? "border-rf-text-primary text-rf-text-primary"
                : "border-transparent text-rf-text-secondary hover:text-rf-text-primary"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Tickets table */}
      {!tickets || tickets.length === 0 ? (
        <div className="text-center py-16 text-rf-text-muted text-sm">
          No tickets found.
        </div>
      ) : (
        <div className="bg-rf-surface-card border border-rf-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rf-border bg-rf-surface-page">
                <th className="px-4 py-3 text-left text-xs font-medium text-rf-text-muted uppercase tracking-wide">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-rf-text-muted uppercase tracking-wide">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-rf-text-muted uppercase tracking-wide">From</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-rf-text-muted uppercase tracking-wide">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-rf-text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-rf-text-muted uppercase tracking-wide">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rf-border">
              {(tickets as HelpTicket[]).map((ticket) => (
                <tr key={ticket.id} className="hover:bg-rf-surface-page transition-colors">
                  <td className="px-4 py-3 text-rf-text-muted font-mono text-xs">
                    #{ticket.ticket_number}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <Link
                      href={`/super-admin/help-center/tickets/${ticket.id}`}
                      className="font-medium text-rf-text-primary hover:text-rf-blue transition-colors line-clamp-1"
                    >
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-rf-text-primary font-medium">{ticket.name}</div>
                    <div className="text-xs text-rf-text-muted">{ticket.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`capitalize font-medium ${priorityStyles[ticket.priority] ?? ""}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusStyles[ticket.status] ?? ""}`}>
                      {statusLabels[ticket.status] ?? ticket.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-rf-text-muted whitespace-nowrap">
                    {new Date(ticket.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
