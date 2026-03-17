import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface QuestionInput {
  id: string;
  text: string;
  type: "multiple_choice" | "short_text" | "yes_no" | "number";
  options: { id: string; label: string }[] | null;
  ai_scoring_guidance: string | null;
}

function isValidQuestion(q: unknown): q is QuestionInput {
  if (typeof q !== "object" || q === null) return false;
  const obj = q as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.text === "string" &&
    typeof obj.type === "string"
  );
}

export async function POST(req: NextRequest) {
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

  let body: { question?: unknown; jobTitle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidQuestion(body.question)) {
    return NextResponse.json(
      { error: "Provide a valid question object." },
      { status: 400 }
    );
  }

  const question = body.question;
  const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle : "this position";

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a recruiting professional helping to improve screening questions for a job posting.

Job title: ${jobTitle}
Question type: ${question.type}

Current question:
${JSON.stringify(
  {
    id: question.id,
    text: question.text,
    options: question.options,
    ai_scoring_guidance: question.ai_scoring_guidance,
  },
  null,
  2
)}

Improve this screening question so it is:
- Clear, concise, and professional
- Easy for job applicants to understand
- Specific to the job role where relevant
- Free of grammatical errors

${
  question.type === "multiple_choice"
    ? "Also improve the options to be clear and comprehensive. Keep the same number of options unless they are redundant. Preserve option IDs exactly."
    : ""
}
${
  question.type === "short_text"
    ? "Also write or improve the ai_scoring_guidance field — this tells an AI how to evaluate and score the applicant's written response. Be specific about what a good answer looks like."
    : ""
}
${
  question.type === "yes_no"
    ? "Keep the question as a clear yes/no question. Do not add ai_scoring_guidance for yes/no questions (set it to null)."
    : ""
}
${
  question.type === "number"
    ? "Keep the question asking for a specific number. Do not add ai_scoring_guidance for number questions (set it to null)."
    : ""
}

Return ONLY a valid JSON object with these fields: "id", "text", "options" (array or null), "ai_scoring_guidance" (string or null).
Preserve the original id exactly. No markdown fences, no explanation.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText =
      message.content.find((b) => b.type === "text")?.text ?? "";

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[screening/enhance] Failed to parse JSON:", cleaned.slice(0, 500));
      return NextResponse.json(
        { error: "AI returned an unexpected format. Please try again." },
        { status: 500 }
      );
    }

    if (typeof parsed !== "object" || parsed === null) {
      return NextResponse.json(
        { error: "AI returned an unexpected format. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ question: parsed });
  } catch (err: any) {
    console.error("[screening/enhance] Anthropic error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to enhance question." },
      { status: 500 }
    );
  }
}
