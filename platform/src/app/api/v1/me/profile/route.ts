import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, requestContext } from '@/modules/auth/session';
import { getOwnPlayerProfile, updateOwnPlayerProfile } from '@/modules/players/service';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const nullableString = z.string().trim().max(4000).nullable().optional();
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

/**
 * Partial update for autosave. Every property is optional and unknown keys are
 * rejected, so the client can send only what changed and cannot reach a column
 * the schema does not name — completionPercent among them.
 */
const patchSchema = z.object({
  firstName: nullableString, lastName: nullableString,
  dateOfBirth: nullableDate, nationality: nullableString, secondNationality: nullableString,
  countryOfResidence: nullableString, city: nullableString,
  currentClub: nullableString, primaryPosition: nullableString, secondaryPosition: nullableString,
  preferredFoot: z.enum(['LEFT', 'RIGHT', 'BOTH']).nullable().optional(),
  heightCm: z.number().int().min(120).max(230).nullable().optional(),
  weightKg: z.number().int().min(40).max(150).nullable().optional(),
  contractUntil: nullableDate, league: nullableString,
  nationalTeamExperience: nullableString, professionalExperience: nullableString,
  transfermarktUrl: nullableString, youtubeUrl: nullableString,
  highlightsUrl: nullableString, instagramUrl: nullableString,
  careerSummary: nullableString, careerGoals: nullableString, availability: nullableString,
  hasAgent: z.boolean().optional(),
  agentName: nullableString, agentAgency: nullableString, agentContact: nullableString,
  representationUntil: nullableDate,
}).strict();

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');
    const profile = await getOwnPlayerProfile(session);
    return NextResponse.json({ profile }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');
    if (session.role !== 'PLAYER') return apiError(403, 'FORBIDDEN', 'common.errorGeneric');

    const parsed = patchSchema.parse(await request.json());

    // Date columns arrive as ISO day strings and must reach Prisma as Dates.
    const patch: Record<string, unknown> = { ...parsed };
    for (const key of ['dateOfBirth', 'contractUntil', 'representationUntil'] as const) {
      const value = parsed[key];
      if (value !== undefined) patch[key] = value === null ? null : new Date(`${value}T00:00:00Z`);
    }

    const profile = await updateOwnPlayerProfile(session, patch, await requestContext());
    return NextResponse.json(
      { profile, completionPercent: profile.completionPercent },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
