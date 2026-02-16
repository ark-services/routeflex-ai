import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // account_id
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state}/integrations?error=oauth_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state}/integrations?error=oauth_failed`);
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/gmail/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get email address for display
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    const supabase = await createClient();

    // Try to upsert with metadata first (if column exists)
    let upsertError = null;
    const baseData = {
      account_id: state,
      integration_type: 'gmail' as const,
      credentials: tokens,
      is_active: true,
    };

    // First attempt: with metadata
    const { error: errorWithMetadata } = await supabase
      .from('integration_credentials')
      .upsert({
        ...baseData,
        metadata: { email: profile.data.emailAddress },
      }, {
        onConflict: 'account_id,integration_type'
      });

    // If metadata column doesn't exist, try without it
    if (errorWithMetadata?.message?.includes('metadata')) {
      console.warn('metadata column not found, retrying without it');
      const { error: errorWithoutMetadata } = await supabase
        .from('integration_credentials')
        .upsert(baseData, {
          onConflict: 'account_id,integration_type'
        });
      upsertError = errorWithoutMetadata;
    } else {
      upsertError = errorWithMetadata;
    }

    if (upsertError) {
      console.error('Failed to store credentials:', upsertError);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state}/integrations?error=storage_failed`);
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state}/integrations?gmail=connected`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state}/integrations?error=oauth_failed`);
  }
}
