import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { uploadBoardFile } from '@/lib/storage/fileUpload';

/**
 * API endpoint to upload files for board columns
 * POST /api/board/upload-file
 *
 * Expects FormData with:
 * - file: File to upload
 * - companyId: Company ID
 * - boardId: Board ID
 * - columnId: Column ID
 * - applicantId: Applicant ID (for tracking)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication using regular client
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Board File Upload API] Authentication failed:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const companyId = formData.get('companyId') as string;
    const boardId = formData.get('boardId') as string;
    const columnId = formData.get('columnId') as string;
    const applicantId = formData.get('applicantId') as string;

    // Validate required fields
    if (!file || !companyId || !boardId || !columnId || !applicantId) {
      console.error('[Board File Upload API] Missing required fields:', {
        hasFile: !!file,
        companyId,
        boardId,
        columnId,
        applicantId
      });
      return NextResponse.json(
        { error: 'Missing required fields: file, companyId, boardId, columnId, applicantId' },
        { status: 400 }
      );
    }

    // Resolve the company's account_id, then verify membership via account_memberships.
    // (The codebase uses account-level membership, not a company_members table.)
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('account_id')
      .eq('id', companyId)
      .maybeSingle();

    if (companyError || !company) {
      console.error('[Board File Upload API] Company lookup failed:', { companyId, error: companyError });
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('account_memberships')
      .select('role')
      .eq('account_id', company.account_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      console.error('[Board File Upload API] Membership check failed:', {
        userId: user.id,
        companyId,
        accountId: company.account_id,
        error: membershipError,
      });
      return NextResponse.json(
        { error: 'Forbidden: User is not a member of this company' },
        { status: 403 }
      );
    }

    // Create service role client for storage operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseServiceKey) {
      console.error('[Board File Upload API] Service role key not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Upload file using service role client
    const uploadResult = await uploadBoardFile(
      serviceClient,
      file,
      companyId,
      boardId,
      columnId
    );

    if (!uploadResult.success) {
      console.error('[Board File Upload API] Upload failed:', uploadResult.error);
      return NextResponse.json(
        { error: uploadResult.error },
        { status: 400 }
      );
    }

    console.log('[Board File Upload API] Upload successful:', {
      companyId,
      boardId,
      columnId,
      applicantId,
      path: uploadResult.path,
      fileName: uploadResult.metadata?.name
    });

    // Return success with file details
    return NextResponse.json({
      success: true,
      path: uploadResult.path,
      url: uploadResult.url,
      metadata: uploadResult.metadata
    });

  } catch (error) {
    console.error('[Board File Upload API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
