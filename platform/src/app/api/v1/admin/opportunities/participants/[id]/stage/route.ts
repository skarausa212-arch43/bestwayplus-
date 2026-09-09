import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { advanceStaff } from '@/modules/opportunities/service';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const STAGES = [
  'NEW', 'PROFILE_UNDER_REVIEW', 'SUBMITTED', 'CLUB_REVIEWING',
  'INFO_REQUESTED', 'NEGOTIATION', 'CLOSED', 'SUCCESSFUL',
] as const;

const body = z.object({ stage: z.enum(STAGES) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');

    const { stage } = body.parse(await request.json());
    const result = await advanceStaff(session, id, stage, await requestContext());

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
