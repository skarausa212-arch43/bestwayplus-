import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { create } from '@/modules/opportunities/service';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const body = z.object({
  name: z.string().trim().min(1).max(200),
  clubName: z.string().trim().max(200).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  league: z.string().trim().max(100).nullable().optional(),
  position: z.string().trim().max(100).nullable().optional(),
  ageMin: z.coerce.number().int().min(14).max(50).nullable().optional(),
  ageMax: z.coerce.number().int().min(14).max(50).nullable().optional(),
  preferredFoot: z.enum(['LEFT', 'RIGHT', 'BOTH']).nullable().optional(),
  salaryMin: z.coerce.number().int().min(0).nullable().optional(),
  salaryMax: z.coerce.number().int().min(0).nullable().optional(),
  salaryCurrency: z.string().trim().max(10).nullable().optional(),
  transferType: z.enum(['TRANSFER', 'LOAN', 'FREE_AGENT']).nullable().optional(),
  contractLengthMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  internalNotes: z.string().trim().max(4000).nullable().optional(),
  visibility: z.enum(['PRIVATE', 'SELECTED', 'VERIFIED_USERS']).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const data = body.parse(await request.json());
    const result = await create(session, data, await requestContext());

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
