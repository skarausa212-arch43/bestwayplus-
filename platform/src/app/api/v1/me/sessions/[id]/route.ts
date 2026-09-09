import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, revokeSession } from '@/modules/auth/session';
import { recordActivity } from '@/modules/activity/service';
import { requestContext } from '@/modules/auth/session';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');

    const revoked = await revokeSession(session.userId, id);
    if (!revoked) return apiError(404, 'NOT_FOUND', 'common.errorGeneric');

    await recordActivity({
      actorUserId: session.userId, subjectUserId: session.userId, action: 'SESSION_REVOKED',
      entityType: 'session', entityId: id, ctx: await requestContext(),
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
