import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RawQuestion {
  question_text: string;
  options: Array<{ id: string; text: string }>;
  correct_option_id: string;
}

function isValidQuestion(q: unknown): q is RawQuestion {
  if (typeof q !== "object" || q === null) return false;
  const obj = q as Record<string, unknown>;
  if (typeof obj.question_text !== "string" || !obj.question_text.trim()) return false;
  if (!Array.isArray(obj.options) || obj.options.length !== 4) return false;
  for (const opt of obj.options) {
    if (typeof opt !== "object" || opt === null) return false;
    const o = opt as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.text !== "string") return false;
  }
  if (typeof obj.correct_option_id !== "string") return false;
  return true;
}

export async function POST(req: NextRequest) {
  // Auth check — must be a signed-in user
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

  let body: { title?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title = "Training Module", content = "" } = body;

  if (!content.trim()) {
    return NextResponse.json(
      { error: "Add module content first, then generate questions." },
      { status: 400 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a quiz writer for a logistics and delivery driver training program.

Below is the content of a training module titled: "${title}"

---
${content}
---

Generate exactly 10 multiple-choice quiz questions that test understanding of the key concepts in this module.

Rules:
- Each question must have exactly 4 answer options with ids "a", "b", "c", "d"
- Only one option is correct
- Questions should test comprehension, not just word-matching
- Vary question types: some recall, some application, some "what should you do" scenarios
- Keep question text concise (1–2 sentences max)
- Keep option text concise (a few words to one sentence max)

Return ONLY a valid JSON array of 10 question objects. No explanation, no markdown fences, no preamble.

Each object must match this exact shape:
{
  "question_text": "string",
  "options": [
    { "id": "a", "text": "string" },
    { "id": "b", "text": "string" },
    { "id": "c", "text": "string" },
    { "id": "d", "text": "string" }
  ],
  "correct_option_id": "a" | "b" | "c" | "d"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
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
      console.error("[generate-questions] Failed to parse JSON:", cleaned.slice(0, 500));
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

    const questions = parsed.filter(isValidQuestion);
    if (questions.length < 5) {
      return NextResponse.json(
        { error: `Only ${questions.length} valid questions were generated. Please try again.` },
        { status: 500 }
      );
    }

    return NextResponse.json({ questions });
  } catch (err: any) {
    console.error("[generate-questions] Anthropic error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to generate questions." },
      { status: 500 }
    );
  }
}
