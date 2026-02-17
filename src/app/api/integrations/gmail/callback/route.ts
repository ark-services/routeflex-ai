import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';
import { integrationCredentialsHasMetadata } from '@/lib/db-schema-check';

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
    const emailAddress = profile.data.emailAddress;

    const supabase = await createClient();

    // Check if metadata column exists before attempting to use it
    const hasMetadataColumn = await integrationCredentialsHasMetadata(supabase);

    // Build base data that always works
    const baseData = {
      account_id: state,
      integration_type: 'gmail' as const,
      credentials: tokens,
      is_active: true,
    };

    let upsertError = null;

    if (hasMetadataColumn) {
      // Try with metadata if column exists
      console.log('[OAuth callback] metadata column exists, including in upsert');
      const { error } = await supabase
        .from('integration_credentials')
        .upsert({
          ...baseData,
          metadata: { email: emailAddress },
        }, {
          onConflict: 'account_id,integration_type'
        });
      upsertError = error;
    } else {
      // Column doesn't exist, skip metadata
      console.warn('[OAuth callback] ⚠️  metadata column does not exist, upserting without it');
      const { error } = await supabase
        .from('integration_credentials')
        .upsert(baseData, {
          onConflict: 'account_id,integration_type'
        });
      upsertError = error;
    }

    // Defensive fallback: if still failed with metadata error, retry without it
    if (upsertError && upsertError.message?.includes('metadata')) {
      console.warn('[OAuth callback] ⚠️  Retry without metadata after error:', upsertError.message);
      const { error: fallbackError } = await supabase
        .from('integration_credentials')
        .upsert(baseData, {
          onConflict: 'account_id,integration_type'
        });
      upsertError = fallbackError;
    }

    if (upsertError) {
      console.error('[OAuth callback] ❌ Failed to store credentials:', upsertError);
      // Return readable error instead of just "storage_failed"
      const errorMsg = encodeURIComponent(upsertError.message || 'Unknown error');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/admin/${state}/integrations?error=storage_failed&details=${errorMsg}`
      );
    }

    console.log('[OAuth callback] ✅ Successfully stored Gmail credentials for account:', state);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state}/integrations?gmail=connected`);
  } catch (err: any) {
    console.error('[OAuth callback] ❌ Exception:', err);
    const errorMsg = encodeURIComponent(err.message || 'Unknown error');
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/${state}/integrations?error=oauth_failed&details=${errorMsg}`
    );
  }
}
