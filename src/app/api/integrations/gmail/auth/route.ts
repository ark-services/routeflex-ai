import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: Old Gmail OAuth route
 *
 * This route is deprecated and should not be used.
 * Use /api/integrations/gmail/start instead.
 *
 * This route relied on NEXT_PUBLIC_APP_URL and GOOGLE_CLIENT_ID (old env vars)
 * which caused configuration drift and "Invalid URL" errors.
 *
 * Canonical OAuth flow:
 * - Start: /api/integrations/gmail/start
 * - Callback: /api/integrations/gmail/callback-new
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  console.warn('[Gmail OAuth /auth] ⚠️  DEPRECATED: This route should not be used');
  console.warn('[Gmail OAuth /auth]    Use /api/integrations/gmail/start instead');

  // Redirect to new start route
  const accountId = request.nextUrl.searchParams.get('account_id');
  const newUrl = new URL('/api/integrations/gmail/start', request.nextUrl.origin);
  if (accountId) {
    newUrl.searchParams.set('account_id', accountId);
  }

  console.log('[Gmail OAuth /auth] Redirecting to new route:', newUrl.toString());
  return NextResponse.redirect(newUrl.toString());
}
