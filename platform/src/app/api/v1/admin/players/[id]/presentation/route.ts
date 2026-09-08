import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { buildPresentation } from '@/modules/presentation/service';
import { fromPrismaLocale } from '@/i18n/routing';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const body = z.object({
  sections: z.object({
    identity: z.boolean().default(false),
    football: z.boolean().default(false),
    career: z.boolean().default(false),
    links: z.boolean().default(false),
  }),
  includeSummary: z.boolean().default(false),
  locale: z.enum(['en', 'pl', 'ru']).optional(),
});

/**
 * Returns the print HTML. In production the worker converts it to a PDF and
 * stores it as a document; returning the markup keeps the layout in one place
 * and makes the output inspectable in review.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');

    const input = body.parse(await request.json());
    const { html } = await buildPresentation(
      session,
      id,
      {
        sections: input.sections,
        includeSummary: input.includeSummary,
        locale: input.locale ?? fromPrismaLocale(session.locale),
      },
      await requestContext(),
    );

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
