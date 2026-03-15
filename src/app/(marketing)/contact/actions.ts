"use server";

export async function submitContactForm(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const company = (formData.get("company") as string)?.trim();
  const message = (formData.get("message") as string)?.trim();

  if (!name || !email || !message) {
    return { error: "Name, email, and message are required." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[Contact] RESEND_API_KEY is not set");
    return { error: "Email service is not configured. Please try again later." };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "RouteFlex Contact <contact@routeflex.ai>",
      to: ["dan@routeflex.ai"],
      reply_to: email,
      subject: `New contact from ${name}${company ? ` — ${company}` : ""}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        company ? `Company: ${company}` : null,
        "",
        message,
      ]
        .filter((l) => l !== null)
        .join("\n"),
      html: `
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${company ? `<p><strong>Company:</strong> ${company}</p>` : ""}
        <hr />
        <p style="white-space:pre-wrap">${message}</p>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[Contact] Resend error:", res.status, body);
    return { error: "Failed to send message. Please try again." };
  }

  return { success: true };
}
