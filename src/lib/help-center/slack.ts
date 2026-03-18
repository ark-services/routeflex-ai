import { createServiceClient } from "@/lib/supabase/service";

interface SlackIntegration {
  access_token: string;
  channel_id: string;
  team_id: string;
}

async function getSlackIntegration(): Promise<SlackIntegration | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("help_slack_integration")
    .select("access_token, channel_id, team_id")
    .limit(1)
    .single();
  return data;
}

async function slackAPI(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export async function postTicketToSlack(ticket: {
  id: string;
  ticket_number: number;
  name: string;
  email: string;
  subject: string;
  description: string;
  priority: string;
}): Promise<{ channel: string; ts: string } | null> {
  const integration = await getSlackIntegration();
  if (!integration) return null;

  const helpCenterUrl = process.env.NEXT_PUBLIC_APP_URL || "https://routeflex.ai";

  const messagePayload = {
    channel: integration.channel_id,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🎫 Ticket #${ticket.ticket_number}: ${ticket.subject}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*From:*\n${ticket.name} (${ticket.email})` },
          { type: "mrkdwn", text: `*Priority:*\n${ticket.priority}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Description:*\n${ticket.description.slice(0, 2000)}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${helpCenterUrl}/help-center/tickets/${ticket.id}|View Ticket> • Reply in this thread to respond`,
          },
        ],
      },
    ],
    text: `New support ticket #${ticket.ticket_number}: ${ticket.subject}`,
  };

  let result = await slackAPI(integration.access_token, "chat.postMessage", messagePayload);

  // If bot isn't in the channel, join it and retry
  if (!result.ok && result.error === "not_in_channel") {
    const joinResult = await slackAPI(integration.access_token, "conversations.join", {
      channel: integration.channel_id,
    });
    if (joinResult.ok) {
      result = await slackAPI(integration.access_token, "chat.postMessage", messagePayload);
    } else {
      console.error("[help-center/slack] Failed to join channel:", joinResult.error);
    }
  }

  if (result.ok && result.channel && result.ts) {
    return {
      channel: result.channel as string,
      ts: result.ts as string,
    };
  }

  console.error("[help-center/slack] Failed to post message:", result);
  return null;
}

export async function postReplyToSlack(
  channel: string,
  threadTs: string,
  text: string
): Promise<void> {
  const integration = await getSlackIntegration();
  if (!integration) return;

  await slackAPI(integration.access_token, "chat.postMessage", {
    channel,
    thread_ts: threadTs,
    text,
  });
}

export async function fetchSlackChannels(
  accessToken: string
): Promise<{ id: string; name: string }[]> {
  const res = await fetch(
    "https://slack.com/api/conversations.list?exclude_archived=true&types=public_channel,private_channel&limit=200",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = (await res.json()) as {
    ok: boolean;
    channels?: { id: string; name: string }[];
  };
  if (!data.ok) return [];
  return (data.channels ?? []).map((c) => ({ id: c.id, name: c.name }));
}

export { getSlackIntegration };
