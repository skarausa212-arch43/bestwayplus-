import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { assignRequest } from '@/modules/recruitment/service';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const body = z.object({ assigneeUserId: z.string().uuid() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');

    const { assigneeUserId } = body.parse(await request.json());
    const result = await assignRequest(session, id, assigneeUserId, await requestContext());

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
