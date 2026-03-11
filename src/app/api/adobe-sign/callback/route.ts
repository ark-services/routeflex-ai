import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { encrypt, decrypt } from '@/lib/encryption';
import { registerWebhook } from '@/lib/adobe-sign/client';

function getBaseUrl(request: NextRequest): string {
  try {
    const origin = request.nextUrl.origin;
    if (origin && origin !== 'null') return origin;
  } catch {}
  return process.env.NODE_ENV === 'production' ? 'https://app.routeflex.io' : 'http://localhost:3000';
}

function buildRedirectUrl(baseUrl: string, path: string, params?: Record<string, string>): string {
  try {
    const url = new URL(path, baseUrl);
    if (params) {
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    }
    return url.toString();
  } catch {
    return path;
  }
}

/**
 * Adobe Sign OAuth Callback
 *
 * Reads Client ID + Secret from the company's saved credentials (DB),
 * exchanges the code for tokens, and stores them encrypted.
 * Uses UPDATE (not revoke+insert) to avoid UNIQUE constraint issues on reconnect.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const baseUrl = getBaseUrl(request);

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');
    const apiAccessPoint = searchParams.get('api_access_point');

    if (error) {
      return NextResponse.redirect(buildRedirectUrl(baseUrl, '/admin', { error: 'oauth_denied' }));
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(buildRedirectUrl(baseUrl, '/admin', { error: 'oauth_failed' }));
    }

    // Validate CSRF nonce
    const cookieNonce = request.cookies.get('adobe_sign_oauth_nonce')?.value;
    if (!cookieNonce) {
      return NextResponse.redirect(buildRedirectUrl(baseUrl, '/admin', { error: 'csrf_failed' }));
    }

    let state: { accountId: string; companyId: string; userId: string; nonce: string };
    try {
      state = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf-8'));
    } catch {
      return NextResponse.redirect(buildRedirectUrl(baseUrl, '/admin', { error: 'invalid_state' }));
    }

    if (state.nonce !== cookieNonce) {
      return NextResponse.redirect(buildRedirectUrl(baseUrl, '/admin', { error: 'csrf_failed' }));
    }

    // Verify user is authenticated and matches state
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.id !== state.userId) {
      return NextResponse.redirect(buildRedirectUrl(baseUrl, '/login', {}));
    }

    // Verify membership
    const { data: membership } = await supabase
      .from('account_memberships')
      .select('role')
      .eq('account_id', state.accountId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.redirect(buildRedirectUrl(baseUrl, '/admin', { error: 'forbidden' }));
    }

    // Read Client ID + Secret from the company's saved credentials
    const serviceClient = createServiceClient();
    const { data: credRow } = await serviceClient
      .from('adobe_sign_connections')
      .select('client_id_encrypted, client_secret_encrypted')
      .eq('company_id', state.companyId)
      .maybeSingle();

    if (!credRow?.client_id_encrypted || !credRow?.client_secret_encrypted) {
      console.error('[Adobe Sign OAuth] No credentials saved for company:', state.companyId);
      return NextResponse.redirect(buildRedirectUrl(
        baseUrl,
        `/admin/${state.accountId}/companies/${state.companyId}/integrations`,
        { error: 'credentials_missing' }
      ));
    }

    const clientId = decrypt(credRow.client_id_encrypted);
    const clientSecret = decrypt(credRow.client_secret_encrypted);
    const redirectUri = `${baseUrl}/api/adobe-sign/callback`;

    // Exchange code for tokens
    const tokenEndpoint = apiAccessPoint
      ? `${apiAccessPoint}oauth/v2/token`
      : 'https://api.adobesign.com/oauth/v2/token';

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error('[Adobe Sign OAuth] Token exchange failed:', errBody);
      return NextResponse.redirect(buildRedirectUrl(
        baseUrl,
        `/admin/${state.accountId}/companies/${state.companyId}/integrations`,
        { error: 'token_exchange_failed' }
      ));
    }

    const tokens = await tokenResponse.json();
    const resolvedApiAccessPoint = tokens.api_access_point || apiAccessPoint || 'https://api.adobesign.com/';

    // Get user info from Adobe Sign
    const userInfoRes = await fetch(`${resolvedApiAccessPoint}api/rest/v6/users/me`, {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });

    let emailAddress = 'unknown';
    if (userInfoRes.ok) {
      const userInfo = await userInfoRes.json();
      emailAddress = userInfo.email || 'unknown';
    }

    // Calculate token expiry
    const tokenExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Encrypt tokens
    let encryptedAccessToken: string;
    let encryptedRefreshToken: string | null = null;

    try {
      encryptedAccessToken = encrypt(tokens.access_token);
      encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    } catch (encryptErr: any) {
      console.error('[Adobe Sign OAuth] Encryption failed:', encryptErr.message);
      if (process.env.NODE_ENV !== 'development') {
        return NextResponse.redirect(buildRedirectUrl(
          baseUrl,
          `/admin/${state.accountId}/companies/${state.companyId}/integrations`,
          { error: 'encryption_failed' }
        ));
      }
      encryptedAccessToken = tokens.access_token;
      encryptedRefreshToken = tokens.refresh_token || null;
    }

    // Register webhook with Adobe Sign
    let webhookId: string | null = null;
    try {
      const webhookUrl = `${baseUrl}/api/adobe-sign/webhook`;
      webhookId = await registerWebhook(
        { accessToken: tokens.access_token, apiAccessPoint: resolvedApiAccessPoint },
        webhookUrl
      );
      console.log('[Adobe Sign OAuth] Webhook registered:', webhookId);
    } catch (webhookErr: any) {
      console.warn('[Adobe Sign OAuth] Webhook registration failed (non-fatal):', webhookErr.message);
    }

    // UPDATE the existing row with OAuth tokens (preserves client credentials)
    const { error: updateError } = await serviceClient
      .from('adobe_sign_connections')
      .update({
        access_token_encrypted: encryptedAccessToken,
        refresh_token_encrypted: encryptedRefreshToken,
        token_expiry: tokenExpiry,
        api_access_point: resolvedApiAccessPoint,
        email_address: emailAddress,
        webhook_id: webhookId,
        is_enabled: true,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', state.companyId);

    if (updateError) {
      console.error('[Adobe Sign OAuth] Failed to store tokens:', updateError);
      return NextResponse.redirect(buildRedirectUrl(
        baseUrl,
        `/admin/${state.accountId}/companies/${state.companyId}/integrations`,
        { error: 'storage_failed' }
      ));
    }

    console.log('[Adobe Sign OAuth] Connection updated for company:', state.companyId, 'account:', emailAddress);

    const response = NextResponse.redirect(buildRedirectUrl(
      baseUrl,
      `/admin/${state.accountId}/companies/${state.companyId}/integrations`,
      { success: 'adobe_sign_connected', email: emailAddress }
    ));
    response.cookies.delete('adobe_sign_oauth_nonce');
    return response;
  } catch (error: any) {
    console.error('[Adobe Sign OAuth] Exception:', error);
    return NextResponse.redirect(buildRedirectUrl(baseUrl, '/admin', { error: 'callback_failed' }));
  }
}
