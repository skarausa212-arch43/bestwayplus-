import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { uploadIntent } from '@/modules/auth/schemas';
import { createUploadIntent } from '@/modules/documents/service';
import { rateLimit, LIMITS } from '@/lib/rate-limit';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Step 1 of the upload. Returns a presigned PUT bound to the declared type
 * and length; the browser then uploads straight to private storage.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const limit = await rateLimit(`upload:${session.userId}`, LIMITS.uploadIntent);
    if (!limit.allowed) {
      return apiError(429, 'RATE_LIMITED', 'validation.tooManyAttempts');
    }

    const input = uploadIntent.parse(await request.json());
    const ctx = await requestContext();

    const result = await createUploadIntent(
      session,
      {
        ownerUserId: input.ownerUserId ?? session.userId,
        type: input.type,
        name: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        expiryDate: input.expiryDate ? new Date(`${input.expiryDate}T00:00:00Z`) : null,
        userComment: input.userComment ?? null,
      },
      ctx,
    );

    return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
