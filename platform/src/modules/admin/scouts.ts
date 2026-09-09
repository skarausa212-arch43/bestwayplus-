import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import type { VerificationStatus } from '@prisma/client';

/** Same reasoning as investors.ts: no verifiedAt/verifiedByUserId on ScoutProfile, so read-only. */
export async function listScouts(actor: Actor, filters: { status?: VerificationStatus; query?: string } = {}) {
  authorize(actor, 'profile:readAny', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });

  const scope = actor.role === 'MANAGER' ? { user: { responsibleManagerId: actor.userId } } : {};

  return prisma.scoutProfile.findMany({
    where: {
      ...scope,
      ...(filters.status ? { verificationStatus: filters.status } : {}),
      ...(filters.query
        ? {
            OR: [
              { firstName: { contains: filters.query, mode: 'insensitive' } },
              { lastName: { contains: filters.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true, userId: true, firstName: true, lastName: true, country: true,
      experienceYears: true, verificationStatus: true, updatedAt: true,
      user: { select: { email: true, status: true, createdAt: true } },
    },
    orderBy: [{ verificationStatus: 'asc' }, { updatedAt: 'desc' }],
    take: 100,
  });
}

export async function getScoutForStaff(actor: Actor, scoutUserId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: scoutUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) return null;

  authorize(actor, 'profile:readAny', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  return prisma.scoutProfile.findUnique({
    where: { userId: scoutUserId },
    select: {
      id: true, firstName: true, lastName: true, country: true,
      markets: true, leagues: true, languages: true, experienceYears: true, bio: true,
      verificationStatus: true,
      user: { select: { email: true, createdAt: true, responsibleManagerId: true, responsibleManager: { select: { email: true } } } },
    },
  });
}
