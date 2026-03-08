import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';
import { ActionResult } from './types';
import { broadcastCell } from './helpers';

/**
 * Action: ai.score_resume
 * Config: {
 *   file_column_id?: string,     — board file column with resume (optional)
 *   score_column_id: string,     — text column for score output
 *   feedback_column_id: string,  — text column for feedback output
 *   criteria: string,            — user-provided scoring criteria
 * }
 */
export async function executeAiScoreResume(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  config: any,
  payload: Record<string, any>
): Promise<ActionResult> {
  const {
    file_column_id,
    score_column_id,
    feedback_column_id,
    criteria,
  } = config;

  const applicantId: string | undefined = payload.applicant_id || payload.subject_id;

  console.log('[executeAiScoreResume] Starting:', {
    file_column_id,
    score_column_id,
    feedback_column_id,
    criteriaLength: criteria?.length,
    applicantId,
    companyId,
    jobId,
  });

  // ── Validate config ─────────────────────────────────────────────────────────
  if (!score_column_id || !feedback_column_id) {
    return { success: false, error: 'ai.score_resume: score_column_id and feedback_column_id are required' };
  }
  if (!criteria?.trim()) {
    return { success: false, error: 'ai.score_resume: criteria is required' };
  }
  if (!applicantId) {
    return { success: false, error: 'ai.score_resume: missing applicant_id in payload' };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: 'ai.score_resume: ANTHROPIC_API_KEY not configured' };
  }

  // ── Helpers: write score (number) and feedback (text) to board cells ─────────
  async function writeScoreCell(score: number | null) {
    const cellData = {
      applicant_id:          applicantId,
      column_id:             score_column_id,
      value_text:            null,
      value_number:          score,
      value_date:            null,
      value_bool:            null,
      value_status_label_id: null,
      value_file_path:       null,
    };
    try {
      await supabase
        .from('board_cells')
        .upsert(cellData, { onConflict: 'applicant_id,column_id' });
    } catch (err) {
      console.error('[executeAiScoreResume] writeScoreCell error (non-fatal):', err);
    }
    // Broadcast to board clients regardless of postgres_changes RLS
    await broadcastCell(jobId, cellData);
  }

  async function writeFeedbackCell(text: string) {
    const cellData = {
      applicant_id:          applicantId,
      column_id:             feedback_column_id,
      value_text:            text,
      value_number:          null,
      value_date:            null,
      value_bool:            null,
      value_status_label_id: null,
      value_file_path:       null,
    };
    try {
      await supabase
        .from('board_cells')
        .upsert(cellData, { onConflict: 'applicant_id,column_id' });
    } catch (err) {
      console.error('[executeAiScoreResume] writeFeedbackCell error (non-fatal):', err);
    }
    // Broadcast to board clients regardless of postgres_changes RLS
    await broadcastCell(jobId, cellData);
  }

  // ── Resolve resume file ─────────────────────────────────────────────────────
  let filePath: string | null = null;
  let fileBucket: string = 'files';

  // Path A: read from the configured file column
  if (file_column_id) {
    const { data: cell } = await supabase
      .from('board_cells')
      .select('value_file_path')
      .eq('applicant_id', applicantId)
      .eq('column_id', file_column_id)
      .maybeSingle();

    if (cell?.value_file_path) {
      filePath = cell.value_file_path;
      fileBucket = 'files';
    }
  }

  // Path B: fall back to applicants.resume_path
  if (!filePath) {
    const { data: applicantRow } = await supabase
      .from('applicants')
      .select('resume_path')
      .eq('id', applicantId)
      .maybeSingle();

    if (applicantRow?.resume_path) {
      filePath = applicantRow.resume_path;
      fileBucket = 'resumes';
    }
  }

  // ── Download the file ───────────────────────────────────────────────────────
  let pdfBase64: string | null = null;
  let docxText: string | null = null;
  let fileSkipReason: string | null = null;

  if (filePath) {
    const lowerPath = filePath.toLowerCase();
    const isPdf  = lowerPath.endsWith('.pdf');
    const isDocx = lowerPath.endsWith('.docx') || lowerPath.endsWith('.doc');

    if (isPdf) {
      const { data: blob, error: dlError } = await supabase.storage
        .from(fileBucket)
        .download(filePath);

      if (dlError || !blob) {
        fileSkipReason = `Could not download resume file: ${dlError?.message ?? 'unknown error'}. Scoring based on application form data only.`;
        console.error('[executeAiScoreResume] PDF download failed:', dlError);
      } else {
        const arrayBuffer = await blob.arrayBuffer();
        pdfBase64 = Buffer.from(arrayBuffer).toString('base64');
        console.log('[executeAiScoreResume] PDF downloaded, base64 length:', pdfBase64.length);
      }
    } else if (isDocx) {
      const { data: blob, error: dlError } = await supabase.storage
        .from(fileBucket)
        .download(filePath);

      if (dlError || !blob) {
        fileSkipReason = `Could not download resume file: ${dlError?.message ?? 'unknown error'}. Scoring based on application form data only.`;
        console.error('[executeAiScoreResume] DOCX download failed:', dlError);
      } else {
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
          docxText = result.value.trim() || null;
          console.log('[executeAiScoreResume] DOCX text extracted, length:', docxText?.length ?? 0);
        } catch (mammothErr: any) {
          fileSkipReason = `Could not read Word document: ${mammothErr?.message ?? 'extraction error'}. Scoring based on application form data only.`;
          console.error('[executeAiScoreResume] Mammoth extraction failed:', mammothErr);
        }
      }
    } else {
      fileSkipReason = `File format not supported (only PDF and DOCX are readable). Scoring based on application form data only.`;
      console.log('[executeAiScoreResume] Unsupported file type, skipping:', filePath);
    }
  }

  // ── Gather form field responses ─────────────────────────────────────────────
  const { data: fieldValues } = await supabase
    .from('applicant_field_values')
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
    .eq('applicant_id', applicantId);

  const formDataLines = (fieldValues ?? [])
    .filter((fv: any) => fv.value_text || fv.value_number != null || fv.value_bool != null || fv.value_date)
    .map((fv: any) => {
      const field = fv.job_application_fields;
      const value =
        fv.value_text ??
        fv.value_number?.toString() ??
        (fv.value_bool != null ? (fv.value_bool ? 'Yes' : 'No') : null) ??
        fv.value_date ??
        '';
      return `${field.label}: ${value}`;
    });

  const formDataText = formDataLines.join('\n');

  // ── Fetch applicant basic info ──────────────────────────────────────────────
  const { data: applicant } = await supabase
    .from('applicants')
    .select('full_name, email, phone')
    .eq('id', applicantId)
    .maybeSingle();

  // ── Guard: nothing to score ─────────────────────────────────────────────────
  if (!pdfBase64 && !docxText && !formDataText.trim()) {
    const msg = 'AI scoring skipped: no resume or application form data available for this applicant.';
    console.log('[executeAiScoreResume]', msg);
    await writeFeedbackCell(msg);
    return { success: true };
  }

  // ── Build Claude API content blocks ─────────────────────────────────────────
  const contentBlocks: any[] = [];

  if (pdfBase64) {
    contentBlocks.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: pdfBase64,
      },
    });
  }

  if (docxText) {
    contentBlocks.push({
      type: 'text',
      text: `## Resume (extracted from Word document)\n\n${docxText}`,
    });
  }

  // Applicant info + form responses
  let contextText = '';
  if (applicant) {
    contextText += `## Applicant\nName: ${applicant.full_name ?? 'Unknown'}\nEmail: ${applicant.email ?? 'N/A'}\nPhone: ${applicant.phone ?? 'N/A'}\n\n`;
  }
  if (formDataText.trim()) {
    contextText += `## Application Form Responses\n\n${formDataText}\n\n`;
  }
  if (contextText) {
    contentBlocks.push({ type: 'text', text: contextText });
  }

  // Scoring instruction — score must be a plain JSON number
  let instruction = `Score this applicant based on the following criteria. Return ONLY valid JSON with exactly two keys:\n`;
  instruction += `- "score": a NUMBER (not a string). Your scoring criteria will specify the scale (e.g. 1-10). Return only the number.\n`;
  instruction += `- "feedback": a string with detailed feedback explaining the score, noting strengths and weaknesses (2-4 sentences).\n\n`;
  instruction += `## Scoring Criteria\n\n${criteria}\n`;

  if (!pdfBase64 && !docxText && fileSkipReason) {
    instruction += `\nNote: ${fileSkipReason}\n`;
  } else if (!pdfBase64 && !docxText) {
    instruction += `\nNote: No resume was provided. Score based only on the application form responses above.\n`;
  }

  instruction += `\nReturn ONLY the JSON object. No markdown fences, no explanation outside the JSON.`;
  contentBlocks.push({ type: 'text', text: instruction });

  // ── Call Claude API ─────────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Write "Scoring..." to feedback column while waiting (score column is number — can't write text)
  await writeFeedbackCell('Scoring...');

  let message;
  try {
    message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'You are an expert recruiting evaluator. You assess job applicants objectively based on the provided criteria. Always respond with valid JSON only.',
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
    });
  } catch (apiError: any) {
    const errorMsg = `AI scoring failed: ${apiError.message ?? 'Anthropic API error'}`;
    console.error('[executeAiScoreResume] API error:', apiError);
    await writeFeedbackCell(errorMsg);
    return { success: false, error: errorMsg };
  }

  // ── Parse response ──────────────────────────────────────────────────────────
  const responseText = (message.content.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined)?.text ?? '';

  let scoreNum: number | null = null;
  let feedback = '';

  try {
    // Strip markdown code fences if Claude adds them despite instructions
    const cleaned = responseText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    const rawScore = parsed.score;
    scoreNum = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore));
    if (isNaN(scoreNum)) scoreNum = null;
    feedback = String(parsed.feedback ?? '');
  } catch {
    // If JSON parse fails, use the raw response as feedback
    console.warn('[executeAiScoreResume] JSON parse failed, using raw response');
    feedback = responseText;
  }

  // ── Write results to board cells ────────────────────────────────────────────
  await writeScoreCell(scoreNum);
  await writeFeedbackCell(feedback);

  console.log('[executeAiScoreResume] Scored applicant:', {
    applicantId,
    score: scoreNum,
    feedbackLength: feedback.length,
    model: message.model,
    inputTokens: message.usage?.input_tokens,
    outputTokens: message.usage?.output_tokens,
  });

  return { success: true };
}
