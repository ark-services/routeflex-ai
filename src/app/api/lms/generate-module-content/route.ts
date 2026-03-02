import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image (decoded)

// Allow up to 60 s for the Anthropic call (image analysis can be slow).
export const maxDuration = 60;

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

  let body: { title?: string; images?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title = "Training Module", images = [] } = body;

  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json(
      { error: "At least one image is required." },
      { status: 400 }
    );
  }
  if (images.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_IMAGES} images allowed.` },
      { status: 400 }
    );
  }

  // Validate each image is a data URL and within size limit
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (typeof img !== "string" || !img.startsWith("data:image/")) {
      return NextResponse.json(
        { error: `Image ${i + 1} is not a valid image data URL.` },
        { status: 400 }
      );
    }
    // Rough size check: base64 encoded size → decoded size ≈ base64.length * 0.75
    const base64Part = img.split(",")[1] ?? "";
    const approxBytes = Math.ceil(base64Part.length * 0.75);
    if (approxBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Image ${i + 1} exceeds the 5 MB size limit.` },
        { status: 400 }
      );
    }
  }

  type AllowedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  const ALLOWED_MEDIA_TYPES = new Set<string>(["image/jpeg", "image/png", "image/gif", "image/webp"]);

  // Build the message content — one image block per slide, then the instruction
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  for (const img of images) {
    const [header, base64Data] = img.split(",");
    // header looks like "data:image/png;base64"
    const rawMediaType = header.replace("data:", "").replace(";base64", "");
    const mediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.has(rawMediaType)
      ? (rawMediaType as AllowedMediaType)
      : "image/jpeg";

    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: base64Data,
      },
    });
  }

  contentBlocks.push({
    type: "text",
    text: `The images above are slides from a training module titled: "${title}".

Please write a complete, well-structured learning module in Markdown based on these slides. Follow these guidelines:

- Start with a brief introduction paragraph (no heading needed)
- Use ## headings for each major section or concept
- Use bullet points (- ) for lists of key points or steps
- Use **bold** for important terms, warnings, or rules
- Include a ## Key Takeaways section at the end with 3–6 bullet points
- Write clearly for new delivery drivers — avoid jargon, be direct and practical
- Do NOT simply transcribe text from the slides — synthesize and explain the concepts
- Aim for 400–800 words total

Return ONLY the Markdown content. No preamble, no explanation, no code fences.`,
  });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      system:
        "You are a professional training content writer specializing in logistics and delivery driver onboarding. You write clear, engaging, and practical training materials.",
      messages: [
        {
          role: "user",
          content: contentBlocks,
        },
      ],
    });

    const text =
      message.content.find((b) => b.type === "text")?.text ?? "";

    return NextResponse.json({ content: text });
  } catch (err: any) {
    console.error("[generate-module-content] Anthropic error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to generate content." },
      { status: 500 }
    );
  }
}
