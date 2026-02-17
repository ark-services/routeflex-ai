import { google, gmail_v1 } from 'googleapis';
import { SupabaseClient } from '@supabase/supabase-js';

export async function getGmailClient(
  supabase: SupabaseClient,
  accountId: string
): Promise<{ client: gmail_v1.Gmail; emailAddress: string } | null> {
  const { data: cred, error } = await supabase
    .from('integration_credentials')
    .select('credentials, metadata')
    .eq('account_id', accountId)
    .eq('integration_type', 'gmail')
    .eq('is_active', true)
    .single();

  if (error || !cred) return null;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials(cred.credentials);

  // Auto-refresh handler
  oauth2Client.on('tokens', async (tokens) => {
    await supabase
      .from('integration_credentials')
      .update({
        credentials: {
          ...cred.credentials,
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date,
        }
      })
      .eq('account_id', accountId)
      .eq('integration_type', 'gmail');
  });

  return {
    client: google.gmail({ version: 'v1', auth: oauth2Client }),
    emailAddress: cred.metadata?.email || 'Unknown',
  };
}

export async function sendGmailMessage(
  gmail: gmail_v1.Gmail,
  params: { to: string; subject: string; body: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const message = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      params.body,
    ].join('\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    return { success: true, messageId: response.data.id || undefined };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
