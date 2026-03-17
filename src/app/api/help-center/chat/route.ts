import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 }
    );
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one message." },
      { status: 400 }
    );
  }

  const messages = body.messages.filter(
    (m: unknown): m is ChatMsg =>
      typeof m === "object" &&
      m !== null &&
      typeof (m as ChatMsg).role === "string" &&
      typeof (m as ChatMsg).content === "string" &&
      ["user", "assistant"].includes((m as ChatMsg).role)
  );

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "No valid messages provided." },
      { status: 400 }
    );
  }

  // Fetch all published help articles as context
  const supabase = createServiceClient();
  const { data: articles } = await supabase
    .from("help_articles")
    .select("title, summary, content, category:help_categories(title)")
    .eq("published", true)
    .order("sort_order");

  const knowledgeBase = (articles ?? [])
    .map((a: Record<string, unknown>) => {
      const cat = a.category as { title: string } | null;
      return `## ${a.title}${cat ? ` (${cat.title})` : ""}\n${a.summary ? `*${a.summary}*\n` : ""}${a.content}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = `You are the RouteFlex Help Center assistant. You help users understand how to use RouteFlex, a recruiting platform built for FedEx Ground contractors.

Your job is to answer questions using ONLY the knowledge base documentation provided below. If the answer is not in the documentation, say so honestly and suggest the user submit a support ticket at /help-center/tickets.

Be concise, friendly, and helpful. Use markdown formatting when appropriate. When referencing documentation sections, mention the article title so users can find it.

${knowledgeBase ? `## Knowledge Base Documentation\n\n${knowledgeBase}` : "No documentation is currently available. Suggest the user submit a support ticket for assistance."}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const reply =
      response.content.find((b) => b.type === "text")?.text ??
      "I'm sorry, I couldn't generate a response. Please try again.";

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error("[help-center/chat] Anthropic error:", err);
    return NextResponse.json(
      { error: "Failed to generate response." },
      { status: 500 }
    );
  }
}
