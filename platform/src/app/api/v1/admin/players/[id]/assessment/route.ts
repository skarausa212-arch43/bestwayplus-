import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { getAssessment, upsertAssessment } from '@/modules/admin/players';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const score = z.number().int().min(1).max(10).nullable().optional();
const text = z.string().trim().max(4000).nullable().optional();

const patchSchema = z.object({
  internalRating: score, potential: score, marketability: score, reliability: score,
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).nullable().optional(),
  recommendedMarkets: z.array(z.string().trim().max(120)).max(40).optional(),
  expectedLevel: text, comments: text, nextAction: text,
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict();

/**
 * The internal assessment lives behind its own endpoint so that no
 * client-facing route can ever be widened into returning it by accident.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');

    const assessment = await getAssessment(session, id);
    return NextResponse.json({ assessment }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError(400, 'BAD_REQUEST', 'common.errorGeneric');

    const parsed = patchSchema.parse(await request.json());
    const patch = {
      ...parsed,
      followUpDate:
        parsed.followUpDate === undefined ? undefined
        : parsed.followUpDate === null ? null
        : new Date(`${parsed.followUpDate}T00:00:00Z`),
    };

    const saved = await upsertAssessment(session, id, patch, await requestContext());
    return NextResponse.json({ assessment: saved }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
