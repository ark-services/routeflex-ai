import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/encryption';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin`);
      redirectUrl.searchParams.set('error', 'oauth_denied');
      return NextResponse.redirect(redirectUrl.toString());
    }

    if (!code || !stateParam) {
      const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin`);
      redirectUrl.searchParams.set('error', 'oauth_failed');
      return NextResponse.redirect(redirectUrl.toString());
    }

    // Validate CSRF nonce
    const cookieNonce = request.cookies.get('gmail_oauth_nonce')?.value;
    if (!cookieNonce) {
      const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin`);
      redirectUrl.searchParams.set('error', 'csrf_failed');
      return NextResponse.redirect(redirectUrl.toString());
    }

    // Decode state
    let state: { accountId: string; userId: string; nonce: string };
    try {
      const decoded = Buffer.from(stateParam, 'base64url').toString('utf-8');
      state = JSON.parse(decoded);
    } catch {
      const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin`);
      redirectUrl.searchParams.set('error', 'invalid_state');
      return NextResponse.redirect(redirectUrl.toString());
    }

    // Verify nonce matches
    if (state.nonce !== cookieNonce) {
      const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin`);
      redirectUrl.searchParams.set('error', 'csrf_failed');
      return NextResponse.redirect(redirectUrl.toString());
    }

    // Verify user is authenticated and matches state
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.id !== state.userId) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`);
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
      const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state.accountId}/integrations`);
      redirectUrl.searchParams.set('error', 'token_exchange_failed');
      return NextResponse.redirect(redirectUrl.toString());
    }

    const tokens = await tokenResponse.json();

    // Get user email from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state.accountId}/integrations`);
      redirectUrl.searchParams.set('error', 'userinfo_failed');
      return NextResponse.redirect(redirectUrl.toString());
    }

    const userInfo = await userInfoResponse.json();
    const emailAddress = userInfo.email;

    if (!emailAddress) {
      const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state.accountId}/integrations`);
      redirectUrl.searchParams.set('error', 'no_email');
      return NextResponse.redirect(redirectUrl.toString());
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
      const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state.accountId}/integrations`);
      redirectUrl.searchParams.set('error', 'storage_failed');
      redirectUrl.searchParams.set('details', errorMsg);
      return NextResponse.redirect(redirectUrl.toString());
    }

    // Success - redirect to integrations page with success message
    console.log('[OAuth callback-new] ✅ Successfully stored Gmail connection for user:', state.userId);
    const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin/${state.accountId}/integrations`);
    redirectUrl.searchParams.set('success', 'gmail_connected');
    redirectUrl.searchParams.set('email', emailAddress);

    const response = NextResponse.redirect(redirectUrl.toString());

    // Clear the CSRF cookie
    response.cookies.delete('gmail_oauth_nonce');

    return response;
  } catch (error: any) {
    console.error('[OAuth callback-new] ❌ Exception:', error);
    const errorMsg = encodeURIComponent(error.message || 'Unknown error');
    const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/admin`);
    redirectUrl.searchParams.set('error', 'callback_failed');
    redirectUrl.searchParams.set('details', errorMsg);
    return NextResponse.redirect(redirectUrl.toString());
  }
}
