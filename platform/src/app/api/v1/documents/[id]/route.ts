import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { softDeleteDocument } from '@/modules/documents/service';
import { refreshCompletion } from '@/modules/players/service';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');
    }

    await softDeleteDocument(session, id, await requestContext());
    if (session.role === 'PLAYER') await refreshCompletion(session.userId);

    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
