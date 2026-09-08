import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/modules/auth/session';
import { locales, toPrismaLocale } from '@/i18n/routing';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Persists the interface language on the account. The cookie already switched
 * the UI; this is what makes the next email arrive in the right language.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { locale } = z.object({ locale: z.enum(locales) }).parse(await request.json());
    await prisma.user.update({
      where: { id: session.userId },
      data: { locale: toPrismaLocale(locale) },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
