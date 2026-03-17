import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { postTicketToSlack } from "@/lib/help-center/slack";

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    email?: string;
    subject?: string;
    description?: string;
    priority?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || !body.email || !body.subject || !body.description) {
    return NextResponse.json(
      { error: "name, email, subject, and description are required." },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data: ticket, error } = await supabase
    .from("help_tickets")
    .insert({
      name: body.name,
      email: body.email,
      subject: body.subject,
      description: body.description,
      priority: body.priority ?? "medium",
    })
    .select()
    .single();

  if (error) {
    console.error("[help-center/tickets] Insert failed:", error.message);
    return NextResponse.json(
      { error: "Failed to create ticket." },
      { status: 500 }
    );
  }

  // Post to Slack
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
    console.error("[help-center/tickets] Slack post failed:", err);
  }

  // Add initial message
  await supabase.from("help_ticket_messages").insert({
    ticket_id: ticket.id,
    sender_type: "user",
    sender_name: body.name,
    body: body.description,
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
