import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { createShareLink, revokeShareLink } from '@/modules/admin/share-links';
import { rateLimit, LIMITS } from '@/lib/rate-limit';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const body = z.object({
  playerUserId: z.string().uuid(),
  sections: z.object({
    identity: z.boolean(), football: z.boolean(), career: z.boolean(), links: z.boolean(),
  }),
  documentIds: z.array(z.string().uuid()).max(40).optional(),
  expiresInDays: z.number().int().min(1).max(90),
  password: z.string().min(6).max(200).nullable().optional(),
  recipientLabel: z.string().trim().max(160).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    // Issuing outbound links is rate limited like any other sensitive action.
    const limit = await rateLimit(`share:${session.userId}`, LIMITS.shareView);
    if (!limit.allowed) return apiError(429, 'RATE_LIMITED', 'validation.tooManyAttempts');

    const input = body.parse(await request.json());
    const created = await createShareLink(session, {
      playerUserId: input.playerUserId,
      sections: input.sections,
      documentIds: input.documentIds,
      expiresInDays: input.expiresInDays,
      password: input.password ?? null,
      recipientLabel: input.recipientLabel ?? null,
    }, await requestContext());

    // The plaintext token is in this response and nowhere else, ever.
    return NextResponse.json(created, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    await revokeShareLink(session, id, await requestContext());

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
