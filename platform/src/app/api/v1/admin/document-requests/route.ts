import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { requestDocument } from '@/modules/admin/documents';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const body = z.object({
  targetUserId: z.string().uuid(),
  type: z.enum([
    'PASSPORT_ID', 'PLAYER_CV', 'CLUB_CONTRACT', 'REPRESENTATION_AGREEMENT', 'MEDICAL',
    'STATISTICS', 'TRANSFER_DOCUMENT', 'VISA', 'RESIDENCE_PERMIT', 'INSURANCE',
    'BANK_DETAILS', 'FINANCIAL', 'FIFA_LICENCE', 'COMPANY_DOCUMENT', 'PLAYER_MANDATE',
    'PHOTO', 'OTHER',
  ]),
  message: z.string().trim().min(1).max(1000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const input = body.parse(await request.json());
    const created = await requestDocument(
      session,
      {
        targetUserId: input.targetUserId,
        type: input.type,
        message: input.message,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
      },
      await requestContext(),
    );

    return NextResponse.json(created, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
