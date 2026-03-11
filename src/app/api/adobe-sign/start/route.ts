import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';

/**
 * Adobe Sign OAuth Start Route
 *
 * Reads the Client ID from the company's saved credentials (stored encrypted
 * in adobe_sign_connections). Users enter their credentials directly in the
 * UI — no env vars required.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${request.nextUrl.origin}/login`);
    }

    const accountId = request.nextUrl.searchParams.get('account_id');
    const companyId = request.nextUrl.searchParams.get('company_id');

    if (!accountId || !companyId) {
      return NextResponse.json({ error: 'account_id and company_id required' }, { status: 400 });
    }

    // Verify user has access to this account
    const { data: membership } = await supabase
      .from('account_memberships')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify the company belongs to this account
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Read Client ID from the company's saved credentials
    const serviceClient = createServiceClient();
    const { data: credRow } = await serviceClient
      .from('adobe_sign_connections')
      .select('client_id_encrypted')
      .eq('company_id', companyId)
      .maybeSingle();

    if (!credRow?.client_id_encrypted) {
      return NextResponse.json(
        { error: 'Adobe Sign credentials not configured', message: 'Enter your Client ID and Client Secret on the integrations page first.' },
        { status: 400 }
      );
    }

    const clientId = decrypt(credRow.client_id_encrypted);
    const redirectUri = `${request.nextUrl.origin}/api/adobe-sign/callback`;

    // Generate CSRF nonce
    const nonce = crypto.randomBytes(32).toString('base64url');

    // Create state parameter
    const state = Buffer.from(JSON.stringify({
      accountId,
      companyId,
      userId: user.id,
      nonce,
    })).toString('base64url');

    // Build Adobe Sign OAuth URL
    const authUrl = new URL('https://secure.adobesign.com/public/oauth/v2');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', [
      'agreement_send:account',
      'agreement_read:account',
      'library_read:account',
      'webhook_write:account',
    ].join(' '));
    authUrl.searchParams.set('state', state);

    console.log('[Adobe Sign OAuth Start] Redirecting for company:', companyId);

    const response = NextResponse.redirect(authUrl.toString());
    response.cookies.set('adobe_sign_oauth_nonce', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('[Adobe Sign OAuth Start] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
