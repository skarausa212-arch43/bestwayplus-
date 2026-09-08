import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { issueDownloadUrl } from '@/modules/documents/service';
import { rateLimit, LIMITS } from '@/lib/rate-limit';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const body = z.object({ reason: z.string().trim().max(300).optional() });

/**
 * Issues a 60-second signed GET. Authorised, scan-gated and logged every time
 * — there is no other way to reach a stored file.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const limit = await rateLimit(`download:${session.userId}`, LIMITS.downloadUrl);
    if (!limit.allowed) return apiError(429, 'RATE_LIMITED', 'validation.tooManyAttempts');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');
    }

    const parsed = body.parse(await request.json().catch(() => ({})));
    const ctx = await requestContext();
    const result = await issueDownloadUrl(session, id, { reason: parsed.reason }, ctx);

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
