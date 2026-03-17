"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { postTicketToSlack } from "./slack";
import type {
  HelpCategory,
  HelpArticle,
  HelpTicket,
  HelpTicketMessage,
} from "./types";

// ─── Read operations (public) ───────────────────────────────

export async function getCategories(): Promise<HelpCategory[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("help_categories")
    .select("*, help_articles(count)")
    .order("sort_order");

  return (data ?? []).map((cat: Record<string, unknown>) => ({
    ...cat,
    article_count: (cat.help_articles as { count: number }[])?.[0]?.count ?? 0,
  })) as HelpCategory[];
}

export async function getCategoryBySlug(
  slug: string
): Promise<(HelpCategory & { articles: HelpArticle[] }) | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("help_categories")
    .select("*, articles:help_articles(id, slug, title, summary, tags, sort_order, created_at)")
    .eq("slug", slug)
    .eq("help_articles.published", true)
    .order("sort_order", { referencedTable: "help_articles" })
    .single();

  return data as (HelpCategory & { articles: HelpArticle[] }) | null;
}

export async function getArticle(
  categorySlug: string,
  articleSlug: string
): Promise<(HelpArticle & { category: HelpCategory }) | null> {
  const supabase = createServiceClient();
  const { data: category } = await supabase
    .from("help_categories")
    .select("id, slug, title")
    .eq("slug", categorySlug)
    .single();

  if (!category) return null;

  const { data: article } = await supabase
    .from("help_articles")
    .select("*")
    .eq("category_id", category.id)
    .eq("slug", articleSlug)
    .eq("published", true)
    .single();

  if (!article) return null;

  return { ...article, category } as HelpArticle & { category: HelpCategory };
}

export async function searchArticles(query: string): Promise<HelpArticle[]> {
  const supabase = createServiceClient();
  const searchTerm = `%${query}%`;

  const { data } = await supabase
    .from("help_articles")
    .select("*, category:help_categories(slug, title)")
    .eq("published", true)
    .or(`title.ilike.${searchTerm},summary.ilike.${searchTerm},content.ilike.${searchTerm}`)
    .order("sort_order")
    .limit(20);

  return (data ?? []) as HelpArticle[];
}

export async function getAllPublishedArticles(): Promise<HelpArticle[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("help_articles")
    .select("id, title, summary, content, tags, category:help_categories(slug, title)")
    .eq("published", true)
    .order("sort_order");

  return (data ?? []) as unknown as HelpArticle[];
}

// ─── Ticket operations ──────────────────────────────────────

export async function createTicket(input: {
  name: string;
  email: string;
  subject: string;
  description: string;
  priority?: string;
}): Promise<{ ticket: HelpTicket | null; error: string | null }> {
  const supabase = createServiceClient();

  // Try to get authenticated user
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const { data: ticket, error } = await supabase
    .from("help_tickets")
    .insert({
      user_id: user?.id ?? null,
      name: input.name,
      email: input.email,
      subject: input.subject,
      description: input.description,
      priority: input.priority ?? "medium",
    })
    .select()
    .single();

  if (error) {
    console.error("[help-center] Failed to create ticket:", error.message);
    return { ticket: null, error: "Failed to create ticket. Please try again." };
  }

  // Post to Slack in the background
  try {
    const slackResult = await postTicketToSlack(ticket);
    if (slackResult) {
      await supabase
        .from("help_tickets")
        .update({
          slack_channel: slackResult.channel,
          slack_ts: slackResult.ts,
        })
        .eq("id", ticket.id);
    }
  } catch (err) {
    console.error("[help-center] Failed to post to Slack:", err);
  }

  // Add the initial description as the first message
  await supabase.from("help_ticket_messages").insert({
    ticket_id: ticket.id,
    sender_type: "user",
    sender_name: input.name,
    body: input.description,
  });

  return { ticket: ticket as HelpTicket, error: null };
}

export async function getTicket(
  ticketId: string
): Promise<{ ticket: HelpTicket; messages: HelpTicketMessage[] } | null> {
  const supabase = createServiceClient();

  const { data: ticket } = await supabase
    .from("help_tickets")
    .select("*")
    .eq("id", ticketId)
    .single();

  if (!ticket) return null;

  const { data: messages } = await supabase
    .from("help_ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at");

  return {
    ticket: ticket as HelpTicket,
    messages: (messages ?? []) as HelpTicketMessage[],
  };
}

export async function addTicketMessage(input: {
  ticketId: string;
  senderType: "user" | "admin" | "system";
  senderName: string;
  body: string;
}): Promise<HelpTicketMessage | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("help_ticket_messages")
    .insert({
      ticket_id: input.ticketId,
      sender_type: input.senderType,
      sender_name: input.senderName,
      body: input.body,
    })
    .select()
    .single();

  if (error) {
    console.error("[help-center] Failed to add message:", error.message);
    return null;
  }

  return data as HelpTicketMessage;
}

// ─── Admin operations ────────────────────────────────────────

export async function updateTicketStatus(
  ticketId: string,
  status: "open" | "in_progress" | "resolved" | "closed"
): Promise<{ error: string | null }> {
  const supabase = createServiceClient();

  const update: Record<string, unknown> = { status };
  if (status === "resolved" || status === "closed") {
    update.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("help_tickets")
    .update(update)
    .eq("id", ticketId);

  if (error) {
    console.error("[help-center] Failed to update ticket status:", error.message);
    return { error: "Failed to update status." };
  }

  return { error: null };
}

export async function adminReplyToTicket(input: {
  ticketId: string;
  senderName: string;
  body: string;
}): Promise<{ message: HelpTicketMessage | null; error: string | null }> {
  const supabase = createServiceClient();

  const { data: msg, error } = await supabase
    .from("help_ticket_messages")
    .insert({
      ticket_id: input.ticketId,
      sender_type: "admin",
      sender_name: input.senderName,
      body: input.body,
    })
    .select()
    .single();

  if (error) {
    console.error("[help-center] Failed to add admin reply:", error.message);
    return { message: null, error: "Failed to send reply." };
  }

  // Update status to in_progress if still open
  await supabase
    .from("help_tickets")
    .update({ status: "in_progress" })
    .eq("id", input.ticketId)
    .eq("status", "open");

  // Post to Slack thread if connected
  try {
    const { data: ticket } = await supabase
      .from("help_tickets")
      .select("slack_channel, slack_ts")
      .eq("id", input.ticketId)
      .single();

    if (ticket?.slack_channel && ticket?.slack_ts) {
      const { postReplyToSlack } = await import("./slack");
      await postReplyToSlack(
        ticket.slack_channel,
        ticket.slack_ts,
        `*${input.senderName}:* ${input.body}`
      );
    }
  } catch (err) {
    console.error("[help-center] Failed to post admin reply to Slack:", err);
  }

  return { message: msg as HelpTicketMessage, error: null };
}
