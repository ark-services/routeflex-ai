import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/board/signed-url?path=<storage-path>&bucket=<bucket>
 *
 * Returns a short-lived (5 min) signed URL for a private Supabase Storage file.
 * Auth: user must be a member of the company derived from the path prefix.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const bucket = searchParams.get('bucket') || 'files';

    if (!path) {
      return NextResponse.json({ error: 'Missing required param: path' }, { status: 400 });
    }

    if (path.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Derive companyId from path (format: companyId/boardId/columnId/filename)
    const companyId = path.split('/')[0];
    if (!companyId) {
      return NextResponse.json({ error: 'Cannot derive company from path' }, { status: 400 });
    }

    // Resolve company's account_id
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('account_id')
      .eq('id', companyId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Verify membership
    const { data: membership, error: membershipError } = await supabase
      .from('account_memberships')
      .select('role')
      .eq('account_id', company.account_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Use service role client to generate signed URL (bypasses RLS on storage)
    const serviceClient = createServiceClient();

    const { data: signedData, error: signedError } = await serviceClient.storage
      .from(bucket)
      .createSignedUrl(path, 300); // 5-minute expiry

    if (signedError || !signedData?.signedUrl) {
      console.error('[Signed URL API] Error creating signed URL:', signedError);
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 });
    }

    return NextResponse.json({ url: signedData.signedUrl });
  } catch (error) {
    console.error('[Signed URL API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
