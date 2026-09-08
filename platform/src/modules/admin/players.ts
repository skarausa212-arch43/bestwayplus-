import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import type { Prisma } from '@prisma/client';
import { PLAYER_ROW_SELECT } from './player-select';

/**
 * Staff-facing player queries.
 *
 * The assessment is deliberately NOT part of any select in this file. It is
 * fetched by `getAssessment` below, which carries its own authorisation — so
 * a component that renders the player header cannot accidentally ship an
 * internal rating in its payload.
 */
export interface PlayerFilters {
  query?: string;
  position?: string;
  nationality?: string;
  league?: string;
  hasAgent?: boolean;
  managerId?: string;
  minCompletion?: number;
  contractExpiringBefore?: Date;
  cursor?: string;
  take?: number;
}

export async function listPlayers(actor: Actor, filters: PlayerFilters = {}) {
  // A manager may only list their own clients. Rather than filtering after the
  // fact, the scope is pushed into the where clause.
  authorize(actor, 'profile:readAny', {
    ownerUserId: actor.userId,
    responsibleManagerId: actor.userId,
  });

  const scope: Prisma.PlayerProfileWhereInput =
    actor.role === 'MANAGER' ? { user: { responsibleManagerId: actor.userId } } : {};

  const where: Prisma.PlayerProfileWhereInput = {
    ...scope,
    ...(filters.position ? { primaryPosition: { equals: filters.position, mode: 'insensitive' } } : {}),
    ...(filters.nationality ? { nationality: { equals: filters.nationality, mode: 'insensitive' } } : {}),
    ...(filters.league ? { league: { contains: filters.league, mode: 'insensitive' } } : {}),
    ...(filters.hasAgent !== undefined ? { hasAgent: filters.hasAgent } : {}),
    ...(filters.managerId ? { user: { responsibleManagerId: filters.managerId } } : {}),
    ...(filters.minCompletion ? { completionPercent: { gte: filters.minCompletion } } : {}),
    ...(filters.contractExpiringBefore ? { contractUntil: { lte: filters.contractExpiringBefore } } : {}),
    ...(filters.query
      ? {
          OR: [
            { firstName: { contains: filters.query, mode: 'insensitive' } },
            { lastName: { contains: filters.query, mode: 'insensitive' } },
            { currentClub: { contains: filters.query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const take = Math.min(filters.take ?? 40, 100);
  const rows = await prisma.playerProfile.findMany({
    where,
    select: PLAYER_ROW_SELECT,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  return { rows: hasMore ? rows.slice(0, take) : rows, nextCursor: hasMore ? rows[take - 1]!.id : null };
}

export async function getPlayerForStaff(actor: Actor, playerUserId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: playerUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) return null;

  authorize(actor, 'profile:readAny', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  return prisma.playerProfile.findUnique({
    where: { userId: playerUserId },
    select: {
      ...PLAYER_ROW_SELECT,
      secondNationality: true, countryOfResidence: true, city: true,
      secondaryPosition: true, preferredFoot: true, heightCm: true, weightKg: true,
      league: true, nationalTeamExperience: true, professionalExperience: true,
      transfermarktUrl: true, youtubeUrl: true, highlightsUrl: true, instagramUrl: true,
      careerSummary: true, careerGoals: true, preferredCountries: true, preferredLeagues: true,
      availability: true, salaryMin: true, salaryMax: true, salaryCurrency: true,
      agentName: true, agentAgency: true, agentContact: true, representationUntil: true,
      previousClubs: { select: { id: true, club: true, country: true, fromDate: true, toDate: true, appearances: true, goals: true }, orderBy: { sortIndex: 'asc' } },
    },
  });
}

/**
 * Internal assessment — a separate call with its own permission, on purpose.
 * Nothing that renders a client-visible surface may import this.
 */
export async function getAssessment(actor: Actor, playerUserId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: playerUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) return null;

  authorize(actor, 'assessment:read', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: playerUserId },
    select: { id: true, assessment: true },
  });
  return profile?.assessment ?? null;
}

export async function upsertAssessment(
  actor: Actor,
  playerUserId: string,
  patch: {
    internalRating?: number | null;
    potential?: number | null;
    marketability?: number | null;
    reliability?: number | null;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | null;
    recommendedMarkets?: string[];
    expectedLevel?: string | null;
    comments?: string | null;
    nextAction?: string | null;
    followUpDate?: Date | null;
  },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  const owner = await prisma.user.findUnique({
    where: { id: playerUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) throw new Error('Unknown player');

  authorize(actor, 'assessment:write', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: playerUserId },
    select: { id: true },
  });
  if (!profile) throw new Error('Player has no profile yet');

  const saved = await prisma.playerInternalAssessment.upsert({
    where: { playerProfileId: profile.id },
    create: { playerProfileId: profile.id, ...patch, updatedByUserId: actor.userId },
    update: { ...patch, updatedByUserId: actor.userId },
  });

  // The metadata records which fields moved, never their values — an audit row
  // should not become a second copy of the internal assessment.
  await recordActivity({
    actorUserId: actor.userId, subjectUserId: playerUserId,
    action: 'assessment.updated', entityType: 'playerInternalAssessment', entityId: saved.id,
    metadata: { fields: Object.keys(patch) }, ctx,
  });

  return saved;
}

export { PLAYER_ROW_FIELDS, ASSESSMENT_FIELDS } from './player-select';
