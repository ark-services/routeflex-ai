/**
 * Gmail read utilities for the "Monitor Gmail" automation trigger.
 *
 * Provides functions to search for and parse Gmail messages.
 * Used by the /api/gmail/poll-inbox cron endpoint.
 */

import { gmail_v1 } from "googleapis";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedGmailMessage {
  messageId: string;
  from: string;         // sender email address (extracted from "Name <email>" format)
  subject: string;
  bodyText: string;      // plain text body (or HTML fallback)
  receivedAt: string;    // ISO timestamp
}

// ── searchGmailMessages ──────────────────────────────────────────────────────

/**
 * Search Gmail for messages matching a query string.
 * Returns an array of message IDs (not full messages).
 *
 * @param gmail       Authenticated Gmail client
 * @param query       Gmail search query (e.g., "from:foo@bar.com subject:Hello")
 * @param maxResults  Max messages to return (default 20)
 */
export async function searchGmailMessages(
  gmail: gmail_v1.Gmail,
  query: string,
  maxResults: number = 20,
): Promise<string[]> {
  const response = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  return (response.data.messages || [])
    .map((m) => m.id)
    .filter((id): id is string => !!id);
}

// ── getGmailMessage ──────────────────────────────────────────────────────────

/**
 * Fetch a single Gmail message and parse it into a structured format.
 *
 * @param gmail      Authenticated Gmail client
 * @param messageId  Gmail message ID
 * @returns Parsed message with from, subject, body text, and received timestamp
 */
export async function getGmailMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<ParsedGmailMessage | null> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const message = response.data;
  if (!message.payload) return null;

  // Extract headers
  const headers = message.payload.headers || [];
  const fromHeader = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
  const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";

  // Extract sender email from "Name <email>" format
  const emailMatch = fromHeader.match(/<([^>]+)>/);
  const from = emailMatch ? emailMatch[1] : fromHeader.trim();

  // Extract body text
  const bodyText = extractBodyText(message) ?? "";

  // Parse received timestamp
  const receivedAt = message.internalDate
    ? new Date(parseInt(message.internalDate)).toISOString()
    : new Date().toISOString();

  return { messageId, from, subject, bodyText, receivedAt };
}

// ── extractBodyText ──────────────────────────────────────────────────────────

/**
 * Extract plain text body from a Gmail message payload.
 * Handles both simple and multipart MIME messages.
 *
 * Priority: text/plain → text/html → nested parts
 */
function extractBodyText(message: gmail_v1.Schema$Message): string | null {
  const payload = message.payload;
  if (!payload) return null;

  // Simple message: body directly in payload
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  const parts = payload.parts || [];

  // Look for text/plain first
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
  }

  // Fallback to text/html
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
  }

  // Nested multipart (e.g., multipart/alternative inside multipart/mixed)
  for (const part of parts) {
    if (part.parts) {
      for (const subpart of part.parts) {
        if (subpart.mimeType === "text/plain" && subpart.body?.data) {
          return Buffer.from(subpart.body.data, "base64url").toString("utf-8");
        }
      }
      // HTML fallback in nested parts
      for (const subpart of part.parts) {
        if (subpart.mimeType === "text/html" && subpart.body?.data) {
          return Buffer.from(subpart.body.data, "base64url").toString("utf-8");
        }
      }
    }
  }

  // Last resort: any part with data
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  return null;
}
