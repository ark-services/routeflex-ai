import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface PolishEntry {
  id: string;
  question: string;
  answer: string;
}

function isValidEntry(e: unknown): e is PolishEntry {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.question === "string" &&
    typeof obj.answer === "string"
  );
}

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let body: { entries?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one entry to polish." },
      { status: 400 }
    );
  }

  const inputEntries = body.entries.filter(isValidEntry);
  if (inputEntries.length === 0) {
    return NextResponse.json(
      { error: "No valid entries found." },
      { status: 400 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const entriesJson = JSON.stringify(
    inputEntries.map((e) => ({
      id: e.id,
      question: e.question,
      answer: e.answer,
    }))
  );

  const prompt = `You are a professional recruiting content editor. Below is a JSON array of FAQ entries for a job posting knowledge base.

Clean up and polish each Q&A pair so they are:
- Clear, concise, and easy to understand
- Professional and friendly in tone
- Well-formatted for use in emails, text messages, and phone conversations with job applicants
- Free of grammatical errors and typos
- Substantively the same — do not change the meaning, just improve clarity and tone

Return ONLY a valid JSON array of objects with "id", "question", and "answer" fields. Preserve the original IDs exactly. No markdown fences, no explanation, no preamble.

Input entries:
${entriesJson}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText =
      message.content.find((b) => b.type === "text")?.text ?? "";

    // Strip markdown code fences if present
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error(
        "[knowledge-base/polish] Failed to parse JSON:",
        cleaned.slice(0, 500)
      );
      return NextResponse.json(
        { error: "AI returned an unexpected format. Please try again." },
        { status: 500 }
      );
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "AI returned an unexpected format. Please try again." },
        { status: 500 }
      );
    }

    const polished = parsed.filter(isValidEntry);
    if (polished.length === 0) {
      return NextResponse.json(
        { error: "AI returned no valid entries. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ entries: polished });
  } catch (err: any) {
    console.error("[knowledge-base/polish] Anthropic error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to polish entries." },
      { status: 500 }
    );
  }
}
