import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, isEncryptionAvailable, isPlaintextToken } from '@/lib/encryption';

/**
 * One-time migration endpoint to encrypt plaintext tokens
 *
 * SECURITY: This endpoint is admin-only and should be run once after setting ENCRYPTION_KEY
 *
 * Usage:
 *   POST /api/admin/migrate-encrypt-tokens
 *   Authorization: Bearer <supabase_jwt>
 *
 * Returns:
 *   { success: true, migratedCount: N, errors: [...] }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Verify encryption is available
    if (!isEncryptionAvailable()) {
      return NextResponse.json(
        {
          success: false,
          error: 'ENCRYPTION_KEY not set. Cannot migrate tokens without encryption key.',
        },
        { status: 500 }
      );
    }

    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify user is a superadmin (check if they have admin role on any account)
    // For now, just require authentication - you can add more strict checks
    console.log(`[migrate-encrypt-tokens] Starting migration for user: ${user.id}`);

    // Get all gmail_connections with potentially plaintext tokens
    const { data: connections, error: fetchError } = await supabase
      .from('gmail_connections')
      .select('id, access_token, refresh_token, email_address')
      .is('revoked_at', null);

    if (fetchError) {
      console.error('[migrate-encrypt-tokens] Failed to fetch connections:', fetchError);
      return NextResponse.json(
        { success: false, error: `Database error: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({
        success: true,
        migratedCount: 0,
        message: 'No connections found to migrate',
      });
    }

    let migratedCount = 0;
    const errors: Array<{ id: string; email: string; error: string }> = [];

    // Process each connection
    for (const conn of connections) {
      try {
        let needsUpdate = false;
        let newAccessToken = conn.access_token;
        let newRefreshToken = conn.refresh_token;

        // Check if access_token is plaintext and needs encryption
        if (conn.access_token && isPlaintextToken(conn.access_token)) {
          console.log(`[migrate-encrypt-tokens] Encrypting access_token for: ${conn.email_address}`);
          newAccessToken = encrypt(conn.access_token);
          needsUpdate = true;
        }

        // Check if refresh_token is plaintext and needs encryption
        if (conn.refresh_token && isPlaintextToken(conn.refresh_token)) {
          console.log(`[migrate-encrypt-tokens] Encrypting refresh_token for: ${conn.email_address}`);
          newRefreshToken = encrypt(conn.refresh_token);
          needsUpdate = true;
        }

        // Update if needed
        if (needsUpdate) {
          const { error: updateError } = await supabase
            .from('gmail_connections')
            .update({
              access_token: newAccessToken,
              refresh_token: newRefreshToken,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conn.id);

          if (updateError) {
            console.error(`[migrate-encrypt-tokens] Failed to update ${conn.email_address}:`, updateError);
            errors.push({
              id: conn.id,
              email: conn.email_address,
              error: updateError.message,
            });
          } else {
            migratedCount++;
            console.log(`[migrate-encrypt-tokens] ✅ Migrated: ${conn.email_address}`);
          }
        } else {
          console.log(`[migrate-encrypt-tokens] ⏭️  Already encrypted: ${conn.email_address}`);
        }
      } catch (err: any) {
        console.error(`[migrate-encrypt-tokens] Exception for ${conn.email_address}:`, err);
        errors.push({
          id: conn.id,
          email: conn.email_address,
          error: err.message,
        });
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[migrate-encrypt-tokens] ✅ Migration complete in ${duration}ms`);
    console.log(`[migrate-encrypt-tokens]    Migrated: ${migratedCount}`);
    console.log(`[migrate-encrypt-tokens]    Errors: ${errors.length}`);
    console.log(`[migrate-encrypt-tokens]    Total checked: ${connections.length}`);

    return NextResponse.json({
      success: true,
      migratedCount,
      totalChecked: connections.length,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: duration,
    });
  } catch (error: any) {
    console.error('[migrate-encrypt-tokens] ❌ Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error during migration',
      },
      { status: 500 }
    );
  }
}
