import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

/**
 * Slack OAuth callback handler.
 *
 * Flow:
 * 1. User clicks "Connect Slack" button which redirects to:
 *    https://slack.com/oauth/v2/authorize?client_id=...&scope=chat:write,channels:read&redirect_uri=...
 * 2. Slack redirects back here with ?code=...
 * 3. We exchange the code for an access token
 * 4. We store the token in help_slack_integration
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://routeflex.com";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/help-center?slack_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/help-center?slack_error=no_code`
    );
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = `${appUrl}/api/help-center/slack/oauth`;

  if (!clientId || !clientSecret) {
    console.error("[slack/oauth] Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET");
    return NextResponse.redirect(
      `${appUrl}/help-center?slack_error=misconfigured`
    );
  }

  // Exchange code for token
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    ok: boolean;
    access_token?: string;
    team?: { id: string; name: string };
    bot_user_id?: string;
    incoming_webhook?: { channel_id: string; channel: string };
    error?: string;
  };

  if (!tokenData.ok || !tokenData.access_token) {
    console.error("[slack/oauth] Token exchange failed:", tokenData.error);
    return NextResponse.redirect(
      `${appUrl}/help-center?slack_error=${encodeURIComponent(tokenData.error ?? "token_failed")}`
    );
  }

  // Get the installing user
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  // Determine channel — use incoming webhook channel or default
  const channelId =
    tokenData.incoming_webhook?.channel_id ??
    process.env.SLACK_DEFAULT_CHANNEL_ID ??
    "";
  const channelName = tokenData.incoming_webhook?.channel ?? "";

  // Upsert integration
  const supabase = createServiceClient();
  const { error: upsertError } = await supabase
    .from("help_slack_integration")
    .upsert(
      {
        team_id: tokenData.team?.id ?? "",
        team_name: tokenData.team?.name ?? "",
        access_token: tokenData.access_token,
        channel_id: channelId,
        channel_name: channelName,
        bot_user_id: tokenData.bot_user_id ?? "",
        installed_by: user?.id ?? null,
      },
      { onConflict: "team_id" }
    );

  if (upsertError) {
    console.error("[slack/oauth] Failed to save integration:", upsertError.message);
    return NextResponse.redirect(
      `${appUrl}/help-center?slack_error=save_failed`
    );
  }

  return NextResponse.redirect(`${appUrl}/help-center?slack_connected=true`);
}
