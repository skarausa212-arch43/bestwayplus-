import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import type { VerificationStatus } from '@prisma/client';

export async function listClubs(actor: Actor, filters: { status?: VerificationStatus; query?: string } = {}) {
  authorize(actor, 'profile:readAny', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });

  const scope = actor.role === 'MANAGER' ? { user: { responsibleManagerId: actor.userId } } : {};

  return prisma.clubProfile.findMany({
    where: {
      ...scope,
      ...(filters.status ? { verificationStatus: filters.status } : {}),
      ...(filters.query
        ? {
            OR: [
              { clubName: { contains: filters.query, mode: 'insensitive' } },
              { firstName: { contains: filters.query, mode: 'insensitive' } },
              { lastName: { contains: filters.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true, userId: true, clubName: true, country: true, league: true,
      firstName: true, lastName: true, verificationStatus: true, updatedAt: true,
      user: { select: { email: true, status: true, createdAt: true } },
    },
    orderBy: [{ verificationStatus: 'asc' }, { updatedAt: 'desc' }],
    take: 100,
  });
}

export async function getClubForStaff(actor: Actor, clubUserId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: clubUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) return null;

  authorize(actor, 'profile:readAny', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  return prisma.clubProfile.findUnique({
    where: { userId: clubUserId },
    select: {
      id: true, clubName: true, country: true, league: true, roleTitle: true,
      firstName: true, lastName: true, businessEmail: true, phone: true, website: true,
      verificationStatus: true, verifiedAt: true, verifiedBy: { select: { email: true } },
      user: { select: { email: true, createdAt: true, responsibleManagerId: true, responsibleManager: { select: { email: true } } } },
    },
  });
}

/**
 * ClubProfile carries verifiedAt/verifiedByUserId but — unlike AgentProfile —
 * no verificationNote column, so this stays a plain status change with no
 * written-basis requirement to enforce. It still records who and when.
 */
export async function setClubVerification(
  actor: Actor,
  clubUserId: string,
  status: VerificationStatus,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  authorize(actor, 'verification:decide', { ownerUserId: clubUserId });

  const profile = await prisma.clubProfile.findUnique({
    where: { userId: clubUserId },
    select: { id: true, verificationStatus: true },
  });
  if (!profile) throw new Error('Unknown club');

  const updated = await prisma.clubProfile.update({
    where: { id: profile.id },
    data: {
      verificationStatus: status,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
      verifiedByUserId: status === 'VERIFIED' ? actor.userId : null,
    },
    select: { id: true, verificationStatus: true, verifiedAt: true },
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: clubUserId,
    action: 'club.verificationChanged', entityType: 'clubProfile', entityId: profile.id,
    metadata: { from: profile.verificationStatus, to: status }, ctx,
  });

  return updated;
}
