import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { reviewDocument } from '@/modules/admin/documents';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const body = z.object({
  decision: z.enum(['APPROVED', 'ACTION_REQUIRED', 'REJECTED']),
  comment: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');

    const { decision, comment } = body.parse(await request.json());
    const result = await reviewDocument(session, id, decision, comment ?? null, await requestContext());

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
