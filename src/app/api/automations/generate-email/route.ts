import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface FilterCondition {
  type: string;
  column_id?: string;
  value: string | number | "";
}

interface Column {
  id: string;
  name: string;
  type: string;
}

function buildAutomationDescription(
  triggerKey: string,
  triggerConfig: Record<string, any>,
  filterConditions: FilterCondition[],
  columns: Column[]
): string {
  const lines: string[] = [];

  // Describe trigger
  if (triggerKey === "board.status_changes_to") {
    const col = columns.find((c) => c.id === triggerConfig.column_id);
    const colName = col?.name ?? "Status";
    const val = triggerConfig.changes_to ?? "a value";
    lines.push(`Trigger: When "${colName}" changes to "${val}"`);
  } else if (triggerKey === "applicant.moved_group") {
    const groupName = triggerConfig.group_name ?? "a group";
    lines.push(`Trigger: When applicant is moved to the "${groupName}" group`);
  } else if (triggerKey === "applicant.created") {
    lines.push("Trigger: When a new applicant is created");
  } else if (triggerKey === "form.submitted") {
    lines.push("Trigger: When an application form is submitted");
  } else {
    lines.push(`Trigger: ${triggerKey}`);
  }

  // Describe conditions
  const opLabels: Record<string, string> = {
    status_is: "is",
    status_is_not: "is not",
    text_equals: "equals",
    text_contains: "contains",
    number_eq: "=",
    number_gt: ">",
    number_gte: "≥",
    number_lt: "<",
    number_lte: "≤",
    date_is: "is",
    date_before: "before",
    date_after: "after",
    item_in_group: "is in group",
    is_empty: "is empty",
    is_not_empty: "is not empty",
  };

  const validConditions = filterConditions.filter(
    (c) => c.type === "item_in_group" ? c.value !== "" : c.column_id && c.value !== ""
  );

  if (validConditions.length > 0) {
    lines.push("Conditions (and only if...):");
    for (const cond of validConditions) {
      const col = columns.find((c) => c.id === cond.column_id);
      const colName = col?.name ?? cond.column_id ?? "field";
      const op = opLabels[cond.type] ?? cond.type;
      if (cond.type === "is_empty" || cond.type === "is_not_empty") {
        lines.push(`  - "${colName}" ${op}`);
      } else if (cond.type === "item_in_group") {
        lines.push(`  - Applicant is in group "${cond.value}"`);
      } else {
        lines.push(`  - "${colName}" ${op} "${cond.value}"`);
      }
    }
  }

  return lines.join("\n");
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

  let body: {
    trigger_key?: string;
    trigger_config?: Record<string, any>;
    filter_conditions?: FilterCondition[];
    columns?: Column[];
    user_prompt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    trigger_key = "",
    trigger_config = {},
    filter_conditions = [],
    columns = [],
    user_prompt = "",
  } = body;

  const automationContext = buildAutomationDescription(
    trigger_key,
    trigger_config,
    filter_conditions,
    columns
  );

  const availableVariables = [
    "{{applicant_name}}",
    "{{applicant_email}}",
    "{{job_title}}",
    "{{company_name}}",
    ...columns.map((c) => `{{${c.name.toLowerCase().replace(/\s+/g, "_")}}}`),
  ].join(", ");

  const prompt = `You are an expert recruiter writing automated email templates for a recruiting platform.

The automation is configured as follows:
${automationContext}

${user_prompt ? `Additional context from the user:\n${user_prompt}\n` : ""}
Write a professional email template for this automation. The email will be sent automatically to job applicants when this automation fires.

Available template variables you can use: ${availableVariables}

Guidelines:
- Use variables to personalize the email ({{applicant_name}}, {{job_title}}, {{company_name}}, etc.)
- Be warm, professional, and clear
- Keep the subject line concise and informative
- The body should be a complete, ready-to-send email (greeting, body, closing)
- Do not use markdown formatting in the email body — write plain text only
- Match the tone to the automation's purpose (e.g., rejection emails should be empathetic, interview invites should be enthusiastic)

Return ONLY valid JSON with exactly these two fields, no explanation, no markdown fences:
{
  "subject": "the email subject line",
  "body": "the full email body"
}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content.find((b) => b.type === "text")?.text ?? "";
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: { subject: string; body: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[generate-email] Failed to parse JSON:", cleaned.slice(0, 500));
      return NextResponse.json(
        { error: "AI returned an unexpected format. Please try again." },
        { status: 500 }
      );
    }

    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      return NextResponse.json(
        { error: "AI returned an unexpected format. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ subject: parsed.subject, body: parsed.body });
  } catch (err: any) {
    console.error("[generate-email] Anthropic error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to generate email." },
      { status: 500 }
    );
  }
}
