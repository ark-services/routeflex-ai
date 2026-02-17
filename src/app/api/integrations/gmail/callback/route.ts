import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: Old Gmail OAuth callback route
 *
 * This route is deprecated and should not be used.
 * Use /api/integrations/gmail/callback-new instead.
 *
 * This route relied on NEXT_PUBLIC_APP_URL which caused "Invalid URL" crashes
 * when the environment variable was undefined.
 *
 * Canonical OAuth flow:
 * - Start: /api/integrations/gmail/start
 * - Callback: /api/integrations/gmail/callback-new
 *
 * This route also stored credentials in the old integration_credentials table
 * instead of the per-user gmail_connections table.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  console.error('[Gmail OAuth /callback] ❌ DEPRECATED: This route should not be used');
  console.error('[Gmail OAuth /callback]    The canonical callback is /api/integrations/gmail/callback-new');
  console.error('[Gmail OAuth /callback]    Update GOOGLE_OAUTH_REDIRECT_URI to point to /callback-new');

  // Get base URL from request to avoid NEXT_PUBLIC_APP_URL issues
  const baseUrl = request.nextUrl.origin;

  // Return error to user explaining the issue
  const redirectUrl = new URL('/admin', baseUrl);
  redirectUrl.searchParams.set('error', 'oauth_misconfigured');
  redirectUrl.searchParams.set(
    'details',
    'OAuth callback route is deprecated. Update GOOGLE_OAUTH_REDIRECT_URI to use /callback-new'
  );

  return NextResponse.redirect(redirectUrl.toString());
}
