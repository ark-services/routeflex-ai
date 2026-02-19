import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Prefer company_id param (new); fall back to account_id (legacy)
    const companyId = request.nextUrl.searchParams.get('company_id');
    const accountId = request.nextUrl.searchParams.get('account_id');

    if (!companyId && !accountId) {
      return NextResponse.json({ error: 'company_id required' }, { status: 400 });
    }

    // IMPORTANT: Never return access_token or refresh_token to client
    let query = supabase
      .from('gmail_connections')
      .select('id, email_address, created_at')
      .is('revoked_at', null)
      .order('created_at', { ascending: false });

    if (companyId) {
      query = query.eq('company_id', companyId);
    } else {
      // Legacy fallback: filter by account + current user
      query = query
        .eq('account_id', accountId!)
        .eq('user_id', user.id);
    }

    const { data: connections, error } = await query;

    if (error) {
      console.error('Failed to fetch connections:', error);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    return NextResponse.json({ connections: connections || [] });
  } catch (error: any) {
    console.error('Connections fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
