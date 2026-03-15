import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { SupabaseClient } from "@supabase/supabase-js";

export type QuestionScore = {
  questionId: string;
  score: number;
};

export type ScoringResult = {
  score: number;
  recommendation: "ready_for_fadv" | "needs_review" | "not_recommended";
  summary: string;
  questionScores: QuestionScore[];
};

type ScoringQuestion = {
  id: string;
  text: string;
  type: string;
  ai_scoring_guidance: string | null;
};

type ScoringResponse = {
  questionId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
};

export async function runCompositeScoring(
  supabase: SupabaseClient,
  applicantId: string,
  jobId: string,
  questions: ScoringQuestion[],
  responses: ScoringResponse[],
  distanceMiles: number | null,
  driveTimeMinutes: number | null
): Promise<ScoringResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[runCompositeScoring] ANTHROPIC_API_KEY not set — skipping AI scoring");
    return null;
  }

  // ── Resolve resume file ──────────────────────────────────────────────────────
  let pdfBase64: string | null = null;
  let docxText: string | null = null;

  const { data: applicantRow } = await supabase
    .from("applicants")
    .select("full_name, email, phone, resume_path")
    .eq("id", applicantId)
    .maybeSingle();

  const filePath = applicantRow?.resume_path ?? null;
  if (filePath) {
    const lowerPath = filePath.toLowerCase();
    const isPdf = lowerPath.endsWith(".pdf");
    const isDocx = lowerPath.endsWith(".docx") || lowerPath.endsWith(".doc");

    if (isPdf) {
      const { data: blob } = await supabase.storage.from("resumes").download(filePath);
      if (blob) {
        const buf = await blob.arrayBuffer();
        pdfBase64 = Buffer.from(buf).toString("base64");
      }
    } else if (isDocx) {
      const { data: blob } = await supabase.storage.from("resumes").download(filePath);
      if (blob) {
        try {
          const buf = await blob.arrayBuffer();
          const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
          docxText = result.value.trim() || null;
        } catch {
          // Non-fatal — score without resume
        }
      }
    }
  }

  // ── Gather application form fields ──────────────────────────────────────────
  const { data: fieldValues } = await supabase
    .from("applicant_field_values")
    .select(`
      value_text,
      value_number,
      value_bool,
      value_date,
      job_application_fields!inner (
        key,
        label,
        type
      )
    `)
    .eq("applicant_id", applicantId);

  const formDataLines = (fieldValues ?? [])
    .filter((fv: any) => fv.value_text || fv.value_number != null || fv.value_bool != null || fv.value_date)
    .map((fv: any) => {
      const field = fv.job_application_fields;
      const value =
        fv.value_text ??
        fv.value_number?.toString() ??
        (fv.value_bool != null ? (fv.value_bool ? "Yes" : "No") : null) ??
        fv.value_date ??
        "";
      return `${field.label}: ${value}`;
    });

  // ── Build content blocks ──────────────────────────────────────────────────────
  const contentBlocks: any[] = [];

  if (pdfBase64) {
    contentBlocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    });
  }
  if (docxText) {
    contentBlocks.push({
      type: "text",
      text: `## Resume (extracted from Word document)\n\n${docxText}`,
    });
  }

  let contextText = "";
  if (applicantRow) {
    contextText += `## Applicant\nName: ${applicantRow.full_name ?? "Unknown"}\nEmail: ${applicantRow.email ?? "N/A"}\nPhone: ${applicantRow.phone ?? "N/A"}\n\n`;
  }
  if (formDataLines.length > 0) {
    contextText += `## Application Form Responses\n\n${formDataLines.join("\n")}\n\n`;
  }

  // ── Build screening Q&A section ───────────────────────────────────────────────
  const responseMap = new Map(responses.map((r) => [r.questionId, r]));
  const qaSections: string[] = [];

  for (const q of questions) {
    const r = responseMap.get(q.id);
    let displayValue = "(no answer)";
    if (r) {
      if (q.type === "yes_no") {
        displayValue = r.valueBoolean != null ? (r.valueBoolean ? "Yes" : "No") : (r.valueText ?? "(no answer)");
      } else if (q.type === "number") {
        displayValue = r.valueNumber != null ? String(r.valueNumber) : "(no answer)";
      } else {
        displayValue = r.valueText ?? "(no answer)";
      }
    }

    let section = `Q: ${q.text}\nA: ${displayValue}`;
    if (q.ai_scoring_guidance) {
      section += `\nScoring guidance: ${q.ai_scoring_guidance}`;
    }
    qaSections.push(section);
  }

  if (qaSections.length > 0) {
    contextText += `## Screening Questionnaire Responses\n\n${qaSections.join("\n\n")}\n\n`;
  }

  // ── Distance context ──────────────────────────────────────────────────────────
  if (distanceMiles !== null && driveTimeMinutes !== null) {
    contextText += `## Commute\nDistance to terminal: ${distanceMiles} miles\nEstimated drive time: ${driveTimeMinutes} minutes\n`;
    if (driveTimeMinutes > 50) {
      contextText += `Note: Drive time exceeds 50 minutes — consider this a potential concern for reliability and retention.\n`;
    }
    contextText += "\n";
  }

  if (contextText) {
    contentBlocks.push({ type: "text", text: contextText });
  }

  // ── Scoring instruction ───────────────────────────────────────────────────────
  const questionIdList = questions.map((q) => `"${q.id}"`).join(", ");
  const instruction = `Evaluate this candidate based on their resume, application responses, and screening questionnaire answers above.

Return ONLY valid JSON with exactly these keys:
- "score": integer 0–100 (overall composite score)
- "recommendation": one of "ready_for_fadv", "needs_review", or "not_recommended"
  - ready_for_fadv: strong candidate, 70+
  - needs_review: moderate candidate, 40–69, warrants human review
  - not_recommended: weak fit, below 40
- "summary": 2–4 sentence narrative summary of the candidate's strengths and weaknesses
- "question_scores": array of { "question_id": "<id>", "score": <integer 0–100> } for each screening question.
  Question IDs to score: [${questionIdList}]

Use the per-question scoring guidance (if provided) to inform individual question scores.
No markdown fences, no explanation outside the JSON.`;

  contentBlocks.push({ type: "text", text: instruction });

  // ── Call Claude ───────────────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let message;
  try {
    message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system:
        "You are an expert recruiting evaluator. Assess job candidates objectively based on the provided information. Always respond with valid JSON only.",
      messages: [{ role: "user", content: contentBlocks }],
    });
  } catch (err: any) {
    console.error("[runCompositeScoring] Claude API error:", err);
    return null;
  }

  // ── Parse response ────────────────────────────────────────────────────────────
  const responseText =
    (message.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined)?.text ?? "";

  try {
    const cleaned = responseText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    const score = Math.min(100, Math.max(0, Math.round(Number(parsed.score))));
    const recommendation = ["ready_for_fadv", "needs_review", "not_recommended"].includes(parsed.recommendation)
      ? (parsed.recommendation as ScoringResult["recommendation"])
      : "needs_review";
    const summary = String(parsed.summary ?? "");
    const questionScores: QuestionScore[] = (parsed.question_scores ?? []).map((qs: any) => ({
      questionId: String(qs.question_id),
      score: Math.min(100, Math.max(0, Math.round(Number(qs.score)))),
    }));

    return { score, recommendation, summary, questionScores };
  } catch (err) {
    console.error("[runCompositeScoring] JSON parse failed:", err, "raw:", responseText);
    return null;
  }
}
