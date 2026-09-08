import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { setVerification } from '@/modules/admin/agents';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const body = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'INFO_REQUIRED', 'REJECTED']),
  note: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');

    const { status, note } = body.parse(await request.json());
    const result = await setVerification(session, id, status, note ?? null, await requestContext());

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
