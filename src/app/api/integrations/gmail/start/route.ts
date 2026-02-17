import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * Gmail OAuth Start Route
 *
 * Initiates the OAuth flow by redirecting to Google's consent screen.
 * Validates all required environment variables before proceeding.
 *
 * Required env vars:
 * - GOOGLE_OAUTH_CLIENT_ID
 * - GOOGLE_OAUTH_REDIRECT_URI
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // CRITICAL: Validate required OAuth environment variables
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      const missing = [];
      if (!clientId) missing.push('GOOGLE_OAUTH_CLIENT_ID');
      if (!redirectUri) missing.push('GOOGLE_OAUTH_REDIRECT_URI');

      console.error('[Gmail OAuth Start] ❌ Missing required environment variables:', missing.join(', '));
      console.error('[Gmail OAuth Start]    This will cause "Missing required parameter" errors from Google');
      console.error('[Gmail OAuth Start]    Set these in your .env.local or deployment environment');

      return NextResponse.json(
        {
          error: 'OAuth configuration error',
          message: `Missing required environment variables: ${missing.join(', ')}`,
          details: 'Contact your administrator to configure Gmail OAuth',
        },
        { status: 500 }
      );
    }

    // Log OAuth configuration (diagnostic - no secrets)
    console.log('[Gmail OAuth Start] Configuration validated:');
    console.log(`  Client ID: ${clientId.substring(0, 20)}...`);
    console.log(`  Redirect URI: ${redirectUri}`);

    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Derive base URL from request instead of NEXT_PUBLIC_APP_URL
      const baseUrl = request.nextUrl.origin;
      console.log('[Gmail OAuth Start] User not authenticated, redirecting to login');
      return NextResponse.redirect(`${baseUrl}/login`);
    }

    // Get account_id from query param
    const accountId = request.nextUrl.searchParams.get('account_id');
    if (!accountId) {
      console.warn('[Gmail OAuth Start] ⚠️  Missing account_id parameter');
      return NextResponse.json({ error: 'account_id required' }, { status: 400 });
    }

    // Verify user has access to this account
    const { data: membership } = await supabase
      .from('account_memberships')
      .select('role')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      console.warn('[Gmail OAuth Start] ⚠️  User does not have access to account:', accountId);
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate CSRF nonce
    const nonce = crypto.randomBytes(32).toString('base64url');

    // Create state parameter containing accountId, userId, and nonce
    const state = Buffer.from(JSON.stringify({
      accountId,
      userId: user.id,
      nonce,
    })).toString('base64url');

    // Build Google OAuth URL (all params validated above)
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent'); // Force to get refresh_token
    authUrl.searchParams.set('state', state);

    console.log('[Gmail OAuth Start] ✅ Redirecting to Google OAuth for account:', accountId);
    console.log('[Gmail OAuth Start]    Redirect URI:', redirectUri);

    // Create response with httpOnly cookie for CSRF protection
    const response = NextResponse.redirect(authUrl.toString());
    response.cookies.set('gmail_oauth_nonce', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('[Gmail OAuth Start] ❌ Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message || 'Unknown error during OAuth initialization',
      },
      { status: 500 }
    );
  }
}
