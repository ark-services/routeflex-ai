import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // account ID

  if (!code || !state) {
    return NextResponse.redirect('/admin?error=oauth_failed');
  }

  // TODO: Exchange code for tokens using googleapis
  // TODO: Store tokens in integration_credentials table

  return NextResponse.redirect(`/admin/${state}/integrations?gmail=connected`);
}
