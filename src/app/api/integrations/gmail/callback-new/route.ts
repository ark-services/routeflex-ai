import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/encryption';

/**
 * Get base URL from request with defensive fallback
 * Never throws - always returns a valid URL string
 */
function getBaseUrl(request: NextRequest): string {
  try {
    // Prefer request origin (works in all environments)
    const origin = request.nextUrl.origin;
    if (origin && origin !== 'null') {
      return origin;
    }
  } catch (err: any) {
    console.warn('[getBaseUrl] Failed to get origin from request:', err.message);
  }

  // Defensive fallback for development
  const fallback = process.env.NODE_ENV === 'production'
    ? 'https://app.example.com' // Should never happen in production
    : 'http://localhost:3000';

  console.warn('[getBaseUrl] ⚠️ Using fallback URL:', fallback);
  return fallback;
}

/**
 * Build redirect URL safely - never throws
 */
function buildRedirectUrl(baseUrl: string, path: string, params?: Record<string, string>): string {
  try {
    const url = new URL(path, baseUrl);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return url.toString();
  } catch (err: any) {
    console.error('[buildRedirectUrl] ❌ Failed to build URL:', err.message);
    // Last resort: return path as-is (relative redirect)
    return path;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Get base URL from request (never throws)
  const baseUrl = getBaseUrl(request);
  console.log('[OAuth callback-new] Base URL:', baseUrl);

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      const redirectUrl = buildRedirectUrl(baseUrl, '/admin', { error: 'oauth_denied' });
      return NextResponse.redirect(redirectUrl);
    }

    if (!code || !stateParam) {
      const redirectUrl = buildRedirectUrl(baseUrl, '/admin', { error: 'oauth_failed' });
      return NextResponse.redirect(redirectUrl);
    }

    // Validate CSRF nonce
    const cookieNonce = request.cookies.get('gmail_oauth_nonce')?.value;
    if (!cookieNonce) {
      const redirectUrl = buildRedirectUrl(baseUrl, '/admin', { error: 'csrf_failed' });
      return NextResponse.redirect(redirectUrl);
    }

    // Decode state
    let state: { accountId: string; userId: string; nonce: string };
    try {
      const decoded = Buffer.from(stateParam, 'base64url').toString('utf-8');
      state = JSON.parse(decoded);
    } catch {
      const redirectUrl = buildRedirectUrl(baseUrl, '/admin', { error: 'invalid_state' });
      return NextResponse.redirect(redirectUrl);
    }

    // Verify nonce matches
    if (state.nonce !== cookieNonce) {
      const redirectUrl = buildRedirectUrl(baseUrl, '/admin', { error: 'csrf_failed' });
      return NextResponse.redirect(redirectUrl);
    }

    // Verify user is authenticated and matches state
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.id !== state.userId) {
      const redirectUrl = buildRedirectUrl(baseUrl, '/login', {});
      return NextResponse.redirect(redirectUrl);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token exchange failed:', error);
      const redirectUrl = buildRedirectUrl(
        baseUrl,
        `/admin/${state.accountId}/integrations`,
        { error: 'token_exchange_failed' }
      );
      return NextResponse.redirect(redirectUrl);
    }

    const tokens = await tokenResponse.json();

    // Get user email from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      const redirectUrl = buildRedirectUrl(
        baseUrl,
        `/admin/${state.accountId}/integrations`,
        { error: 'userinfo_failed' }
      );
      return NextResponse.redirect(redirectUrl);
    }

    const userInfo = await userInfoResponse.json();
    const emailAddress = userInfo.email;

    if (!emailAddress) {
      const redirectUrl = buildRedirectUrl(
        baseUrl,
        `/admin/${state.accountId}/integrations`,
        { error: 'no_email' }
      );
      return NextResponse.redirect(redirectUrl);
    }

    // Calculate token expiry
    const tokenExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Encrypt tokens before storage (falls back to plaintext if ENCRYPTION_KEY not set)
    let encryptedAccessToken: string;
    let encryptedRefreshToken: string | null = null;

    try {
      encryptedAccessToken = encrypt(tokens.access_token);
      encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    } catch (encryptErr: any) {
      console.error('Encryption failed, storing tokens in plaintext:', encryptErr.message);
      // Fallback: store in plaintext if encryption fails
      // WARNING: This is insecure but prevents total failure
      encryptedAccessToken = tokens.access_token;
      encryptedRefreshToken = tokens.refresh_token || null;
    }

    // Upsert gmail_connection
    const { error: upsertError } = await supabase
      .from('gmail_connections')
      .upsert({
        account_id: state.accountId,
        user_id: state.userId,
        email_address: emailAddress,
        provider: 'google',
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expiry: tokenExpiry?.toISOString(),
        scope: tokens.scope || '',
        updated_at: new Date().toISOString(),
        revoked_at: null,
      }, {
        onConflict: 'account_id,user_id,email_address',
      });

    if (upsertError) {
      console.error('[OAuth callback-new] ❌ Failed to store connection:', upsertError);
      const errorMsg = encodeURIComponent(upsertError.message || 'Unknown error');
      const redirectUrl = buildRedirectUrl(
        baseUrl,
        `/admin/${state.accountId}/integrations`,
        { error: 'storage_failed', details: errorMsg }
      );
      return NextResponse.redirect(redirectUrl);
    }

    // Success - redirect to integrations page with success message
    console.log('[OAuth callback-new] ✅ Successfully stored Gmail connection for user:', state.userId);
    const redirectUrl = buildRedirectUrl(
      baseUrl,
      `/admin/${state.accountId}/integrations`,
      { success: 'gmail_connected', email: emailAddress }
    );

    const response = NextResponse.redirect(redirectUrl);

    // Clear the CSRF cookie
    response.cookies.delete('gmail_oauth_nonce');

    return response;
  } catch (error: any) {
    console.error('[OAuth callback-new] ❌ Exception:', error);
    const errorMsg = encodeURIComponent(error.message || 'Unknown error');

    // Try to get base URL again in catch block (defensive)
    let catchBaseUrl: string;
    try {
      catchBaseUrl = getBaseUrl(request);
    } catch {
      catchBaseUrl = 'http://localhost:3000'; // Ultimate fallback
    }

    const redirectUrl = buildRedirectUrl(
      catchBaseUrl,
      '/admin',
      { error: 'callback_failed', details: errorMsg }
    );
    return NextResponse.redirect(redirectUrl);
  }
}
