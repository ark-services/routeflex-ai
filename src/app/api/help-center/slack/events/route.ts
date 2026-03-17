import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSlackIntegration } from "@/lib/help-center/slack";
import type { HelpArticle } from "@/lib/help-center/types";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Slack Events API handler.
 *
 * Handles:
 * 1. url_verification challenge
 * 2. message events in threads — when an admin replies in a ticket thread,
 *    the reply is synced back to the ticket and optionally used to improve the KB.
 *
 * Required Slack app event subscriptions:
 * - message.channels (for public channels)
 * - message.groups (for private channels)
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Slack URL verification challenge — must return plain text
  if (body.type === "url_verification") {
    return new NextResponse(body.challenge as string, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Verify this is an event callback
  if (body.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  const event = body.event as Record<string, unknown> | undefined;
  if (!event || event.type !== "message") {
    return NextResponse.json({ ok: true });
  }

  // Skip bot messages and message_changed subtypes
  if (event.subtype || event.bot_id) {
    return NextResponse.json({ ok: true });
  }

  // Only process threaded messages (replies)
  const threadTs = event.thread_ts as string | undefined;
  if (!threadTs) {
    return NextResponse.json({ ok: true });
  }

  const integration = await getSlackIntegration();
  if (!integration) {
    return NextResponse.json({ ok: true });
  }

  // Skip messages from our own bot
  if (event.user === integration.access_token) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();

  // Find the ticket associated with this thread
  const { data: ticket } = await supabase
    .from("help_tickets")
    .select("id, subject, description, status")
    .eq("slack_ts", threadTs)
    .single();

  if (!ticket) {
    return NextResponse.json({ ok: true });
  }

  const messageText = event.text as string;

  // Get the Slack user's display name
  let senderName = "Support Team";
  try {
    const userInfoRes = await fetch("https://slack.com/api/users.info", {
      headers: { Authorization: `Bearer ${integration.access_token}` },
      method: "POST",
      body: new URLSearchParams({ user: event.user as string }),
    });
    const userInfo = (await userInfoRes.json()) as {
      ok: boolean;
      user?: { real_name?: string; profile?: { display_name?: string } };
    };
    if (userInfo.ok && userInfo.user) {
      senderName =
        userInfo.user.profile?.display_name ||
        userInfo.user.real_name ||
        "Support Team";
    }
  } catch {
    // Use default name
  }

  // Save the reply as a ticket message
  await supabase.from("help_ticket_messages").insert({
    ticket_id: ticket.id,
    sender_type: "admin",
    sender_name: senderName,
    body: messageText,
    slack_ts: event.ts as string,
  });

  // Update ticket status to in_progress if still open
  if (ticket.status === "open") {
    await supabase
      .from("help_tickets")
      .update({ status: "in_progress" })
      .eq("id", ticket.id);
  }

  // Check if the reply contains "RESOLVE" to close the ticket
  if (messageText.toLowerCase().includes("[resolve]")) {
    await supabase
      .from("help_tickets")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", ticket.id);
  }

  // Auto-generate a KB suggestion from the Q&A exchange
  if (process.env.ANTHROPIC_API_KEY && messageText.length > 20) {
    try {
      await generateKBSuggestion(ticket, messageText);
    } catch (err) {
      console.error("[slack/events] KB suggestion failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Uses AI to determine if a ticket reply is worth adding to the knowledge base,
 * and if so, creates a polished Q&A article as a draft.
 */
async function generateKBSuggestion(
  ticket: { id: string; subject: string; description: string },
  reply: string
) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Fetch existing KB to avoid duplicates
  const supabase = createServiceClient();
  const { data: existingArticles } = await supabase
    .from("help_articles")
    .select("title, summary")
    .eq("published", true);

  const existingTitles = (existingArticles ?? [])
    .map((a: Partial<HelpArticle>) => a.title)
    .join(", ");

  const prompt = `You are a knowledge base curator. A support ticket was answered. Determine if this Q&A exchange contains useful information that should be added to the help center documentation.

Ticket Subject: ${ticket.subject}
User's Question: ${ticket.description}
Support Reply: ${reply}

Existing KB article titles: ${existingTitles || "none yet"}

If this exchange contains useful, reusable information that isn't already covered, respond with a JSON object:
{
  "should_add": true,
  "category_slug": "<best fitting category slug from: getting-started, managing-jobs, automation, applicant-management, screening, account-settings, billing, troubleshooting>",
  "title": "<concise article title>",
  "summary": "<one sentence summary>",
  "content": "<full markdown article content, well-structured with headers>"
}

If the exchange is too specific, already covered, or not useful for documentation, respond with:
{ "should_add": false }

Return ONLY valid JSON, no markdown fences.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText =
    response.content.find((b) => b.type === "text")?.text ?? "";
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return;
  }

  if (!parsed.should_add) return;

  // Find the category
  const { data: category } = await supabase
    .from("help_categories")
    .select("id")
    .eq("slug", parsed.category_slug as string)
    .single();

  if (!category) return;

  // Create as unpublished draft article
  const slug = (parsed.title as string)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  await supabase.from("help_articles").insert({
    category_id: category.id,
    slug,
    title: parsed.title as string,
    summary: parsed.summary as string,
    content: parsed.content as string,
    tags: ["auto-generated", "from-ticket"],
    published: false, // draft — requires review before publishing
    sort_order: 999,
  });
}
