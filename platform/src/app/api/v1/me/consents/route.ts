import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { recordConsent, withdrawProfileSharing } from '@/modules/consent/service';
import { fromPrismaLocale } from '@/i18n/routing';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Required consents are not togglable here; withdrawing them means deleting
// the account, which is a different, deliberate flow.
const body = z.object({
  type: z.enum(['PROFILE_SHARING', 'MARKETING', 'COOKIES_ANALYTICS', 'COOKIES_MARKETING']),
  granted: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { type, granted } = body.parse(await request.json());
    const ctx = await requestContext();
    const locale = fromPrismaLocale(session.locale);

    // Withdrawing profile sharing must also revoke live share links, so it
    // goes through the service rather than writing a bare consent row.
    if (type === 'PROFILE_SHARING' && !granted) {
      const result = await withdrawProfileSharing(session, session.userId, locale, ctx);
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    await recordConsent({ userId: session.userId, type, granted, locale, ctx });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
