import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default async function HelpCenterAdminPage() {
  const supabase = createServiceClient();

  const { data: integration } = await supabase
    .from("help_slack_integration")
    .select("team_name, channel_name, channel_id, bot_user_id, created_at")
    .limit(1)
    .single();

  const { count: ticketCount } = await supabase
    .from("help_tickets")
    .select("*", { count: "exact", head: true });

  const { count: openCount } = await supabase
    .from("help_tickets")
    .select("*", { count: "exact", head: true })
    .eq("status", "open");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-rf-text-primary">Help Center</h1>
        <p className="text-sm text-rf-text-secondary mt-1">Manage Slack integration and support tickets</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/super-admin/help-center/tickets"
          className="bg-rf-surface-card border border-rf-border rounded-lg p-4 hover:border-rf-ink-300 transition-colors group"
        >
          <p className="text-sm text-rf-text-secondary">Total Tickets</p>
          <div className="flex items-end justify-between mt-1">
            <p className="text-2xl font-semibold text-rf-text-primary">{ticketCount ?? 0}</p>
            <ArrowRight className="h-4 w-4 text-rf-text-muted group-hover:text-rf-text-secondary transition-colors mb-0.5" />
          </div>
        </Link>
        <Link
          href="/super-admin/help-center/tickets?status=open"
          className="bg-rf-surface-card border border-rf-border rounded-lg p-4 hover:border-rf-ink-300 transition-colors group"
        >
          <p className="text-sm text-rf-text-secondary">Open Tickets</p>
          <div className="flex items-end justify-between mt-1">
            <p className="text-2xl font-semibold text-rf-text-primary">{openCount ?? 0}</p>
            <ArrowRight className="h-4 w-4 text-rf-text-muted group-hover:text-rf-text-secondary transition-colors mb-0.5" />
          </div>
        </Link>
      </div>

      {/* Slack Integration */}
      <div className="bg-rf-surface-card border border-rf-border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-rf-text-primary">Slack Integration</h2>
            <p className="text-sm text-rf-text-secondary mt-1">
              New tickets are posted to Slack so your team can respond.
            </p>
          </div>
          {integration ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rf-surface-page text-rf-text-secondary border border-rf-border">
              <span className="w-1.5 h-1.5 rounded-full bg-rf-ink-400" />
              Not connected
            </span>
          )}
        </div>

        {integration && (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-rf-text-secondary w-24 shrink-0">Workspace:</dt>
              <dd className="text-rf-text-primary font-medium">{integration.team_name || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-rf-text-secondary w-24 shrink-0">Channel:</dt>
              <dd className="text-rf-text-primary font-medium">
                {integration.channel_name ? `#${integration.channel_name}` : integration.channel_id}
              </dd>
            </div>
          </dl>
        )}

        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/api/help-center/slack/connect"
            className="inline-flex items-center gap-2 px-4 py-2 bg-rf-text-primary text-white text-sm font-medium rounded-lg hover:bg-rf-ink-700 transition-colors"
          >
            {integration ? "Reconnect Slack" : "Connect Slack"}
          </Link>
          {integration && (
            <p className="text-xs text-rf-text-secondary">
              Reconnect if notifications stopped working or to update the channel.
            </p>
          )}
        </div>

        {integration && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Required Slack app scopes:</strong>{" "}
              <code className="font-mono">chat:write</code>,{" "}
              <code className="font-mono">channels:join</code>,{" "}
              <code className="font-mono">channels:read</code>,{" "}
              <code className="font-mono">users:info</code>
              <br />
              If notifications are not working, make sure these scopes are added in your{" "}
              <a
                href="https://api.slack.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Slack App settings
              </a>
              {" "}under <em>OAuth &amp; Permissions → Bot Token Scopes</em>, then click Reconnect.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
