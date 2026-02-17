import { NextResponse } from 'next/server';
import { verifyEncryption, isEncryptionAvailable, generateEncryptionKey } from '@/lib/encryption';

/**
 * Verify encryption is configured and working correctly
 *
 * GET /api/admin/verify-encryption
 *
 * Returns:
 *   {
 *     available: boolean,
 *     verified: boolean,
 *     error?: string,
 *     suggestion?: string
 *   }
 */
export async function GET(): Promise<NextResponse> {
  const available = isEncryptionAvailable();

  if (!available) {
    const generatedKey = generateEncryptionKey();
    return NextResponse.json({
      available: false,
      verified: false,
      error: 'ENCRYPTION_KEY environment variable not set',
      suggestion: `Add to .env.local:\nENCRYPTION_KEY=${generatedKey}`,
    });
  }

  const result = verifyEncryption();

  if (!result.success) {
    return NextResponse.json({
      available: true,
      verified: false,
      error: result.error,
    });
  }

  return NextResponse.json({
    available: true,
    verified: true,
    message: 'Encryption is configured correctly and working',
  });
}
