import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import { completionPercent, evaluateChecklist, nextStep, type CompletionSnapshot } from './completion';
import type { Prisma } from '@prisma/client';

/**
 * The player's own view of their profile. Nothing internal is selectable from
 * here — the assessment lives in a different table with a different policy.
 */
const OWN_PROFILE_SELECT = {
  id: true, firstName: true, lastName: true, dateOfBirth: true,
  nationality: true, secondNationality: true, countryOfResidence: true, city: true,
  currentClub: true, primaryPosition: true, secondaryPosition: true, preferredFoot: true,
  heightCm: true, weightKg: true, contractUntil: true, league: true,
  nationalTeamExperience: true, professionalExperience: true,
  transfermarktUrl: true, youtubeUrl: true, highlightsUrl: true, instagramUrl: true,
  careerSummary: true, careerGoals: true, preferredCountries: true, preferredLeagues: true,
  availability: true, salaryMin: true, salaryMax: true, salaryCurrency: true,
  hasAgent: true, agentName: true, agentAgency: true, agentContact: true, representationUntil: true,
  completionPercent: true, updatedAt: true,
} as const satisfies Prisma.PlayerProfileSelect;

export type OwnPlayerProfile = Prisma.PlayerProfileGetPayload<{ select: typeof OWN_PROFILE_SELECT }>;

export async function getOwnPlayerProfile(actor: Actor) {
  authorize(actor, 'profile:readOwn', { ownerUserId: actor.userId });
  return prisma.playerProfile.findUnique({
    where: { userId: actor.userId },
    select: OWN_PROFILE_SELECT,
  });
}

/** Document types the player holds, used by the completion calculation. */
async function heldDocumentTypes(userId: string) {
  const rows = await prisma.document.findMany({
    where: { ownerUserId: userId, deletedAt: null, status: { notIn: ['REJECTED', 'EXPIRED'] } },
    select: { type: true },
    distinct: ['type'],
  });
  return rows.map((row) => row.type);
}

export async function getCompletion(actor: Actor) {
  authorize(actor, 'profile:readOwn', { ownerUserId: actor.userId });

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: actor.userId },
    select: OWN_PROFILE_SELECT,
  });
  if (!profile) return { percent: 0, checklist: evaluateChecklist({}), next: nextStep({}) };

  const snapshot: CompletionSnapshot = { ...profile, documentTypes: await heldDocumentTypes(actor.userId) };
  return {
    percent: completionPercent(snapshot),
    checklist: evaluateChecklist(snapshot),
    next: nextStep(snapshot),
  };
}

/**
 * Partial update, built for autosave: the form sends only what changed, and
 * the stored completion percentage is recalculated in the same transaction so
 * the dashboard can never disagree with the profile.
 */
export async function updateOwnPlayerProfile(
  actor: Actor,
  patch: Partial<Omit<OwnPlayerProfile, 'id' | 'completionPercent' | 'updatedAt'>>,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  authorize(actor, 'profile:updateOwn', { ownerUserId: actor.userId });

  const documentTypes = await heldDocumentTypes(actor.userId);

  const updated = await prisma.$transaction(async (tx) => {
    const profile = await tx.playerProfile.upsert({
      where: { userId: actor.userId },
      create: { userId: actor.userId, ...patch },
      update: patch,
      select: OWN_PROFILE_SELECT,
    });

    const percent = completionPercent({ ...profile, documentTypes });
    if (percent === profile.completionPercent) return profile;

    return tx.playerProfile.update({
      where: { userId: actor.userId },
      data: { completionPercent: percent },
      select: OWN_PROFILE_SELECT,
    });
  });

  await recordActivity({
    actorUserId: actor.userId,
    subjectUserId: actor.userId,
    action: 'profile.updated',
    entityType: 'playerProfile',
    entityId: updated.id,
    metadata: { fields: Object.keys(patch) },
    ctx,
  });

  return updated;
}

/** Recomputes completion after a document changes — called by the document flow. */
export async function refreshCompletion(userId: string): Promise<number> {
  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
    select: OWN_PROFILE_SELECT,
  });
  if (!profile) return 0;

  const percent = completionPercent({ ...profile, documentTypes: await heldDocumentTypes(userId) });
  if (percent !== profile.completionPercent) {
    await prisma.playerProfile.update({ where: { userId }, data: { completionPercent: percent } });
  }
  return percent;
}
