import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { recruitmentRequest } from '@/modules/auth/schemas';
import { createRequest } from '@/modules/recruitment/service';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const data = recruitmentRequest.parse(await request.json());
    const result = await createRequest(session, {
      ...data,
      deadline: data.deadline ? new Date(`${data.deadline}T00:00:00Z`) : undefined,
    }, await requestContext());

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
