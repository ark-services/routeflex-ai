import { NextResponse } from "next/server";

/**
 * Initiates the Slack OAuth flow for the help center integration.
 * Redirects to Slack's authorize endpoint with the required scopes.
 *
 * Required bot scopes:
 *   chat:write       — post messages to channels
 *   channels:join    — auto-join public channels (avoids "not_in_channel" errors)
 *   channels:read    — read channel info
 *   users:info       — fetch user display names for reply attribution
 */
export async function GET() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://routeflex.com";

  if (!clientId) {
    return NextResponse.json({ error: "SLACK_CLIENT_ID not configured" }, { status: 500 });
  }

  const redirectUri = `${appUrl}/api/help-center/slack/oauth`;
  const scopes = ["chat:write", "channels:join", "channels:read", "users:info"].join(",");

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(url.toString());
}
