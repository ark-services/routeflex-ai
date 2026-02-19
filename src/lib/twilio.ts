import twilio from "twilio";

/**
 * Validate Twilio credentials by fetching the account resource.
 * Returns true if credentials are valid, false otherwise.
 */
export async function validateTwilioCredentials(
  accountSid: string,
  authToken: string
): Promise<boolean> {
  try {
    const client = twilio(accountSid, authToken);
    await client.api.accounts(accountSid).fetch();
    return true;
  } catch {
    return false;
  }
}

/**
 * Send an SMS message via Twilio REST API.
 */
export async function sendSms(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({ from, to, body });
    return { success: true, sid: message.sid };
  } catch (err: any) {
    return { success: false, error: err.message ?? String(err) };
  }
}

/**
 * Make a phone call and read a message using Twilio TTS.
 * TwiML is generated inline — no webhook needed.
 */
export async function makeCallSay(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  sayText: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const client = twilio(accountSid, authToken);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${escapeXml(sayText)}</Say></Response>`;
    const call = await client.calls.create({ from, to, twiml });
    return { success: true, sid: call.sid };
  } catch (err: any) {
    return { success: false, error: err.message ?? String(err) };
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
