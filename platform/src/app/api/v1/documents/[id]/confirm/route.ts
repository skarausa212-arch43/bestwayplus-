import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { confirmUpload } from '@/modules/documents/service';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Step 2 — verifies the object landed and matches, then queues the scan. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');
    }

    const result = await confirmUpload(session, id, await requestContext());
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
