import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import { notify } from '@/modules/notifications/service';
import type { VerificationStatus } from '@prisma/client';

/**
 * Single agent, for the detail page. Same authorisation shape as
 * getPlayerForStaff: the owning user is looked up first so a manager's scope
 * (their own clients only) can be checked before any profile data is read.
 */
export async function getAgentForStaff(actor: Actor, agentUserId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: agentUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) return null;

  authorize(actor, 'profile:readAny', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  return prisma.agentProfile.findUnique({
    where: { userId: agentUserId },
    select: {
      id: true, firstName: true, lastName: true, nationality: true, country: true,
      fifaLicenceNumber: true, agencyName: true, website: true, phone: true,
      markets: true, countries: true, leagues: true, languages: true, specialisations: true,
      bio: true, verificationStatus: true, verifiedAt: true, verificationNote: true,
      verifiedBy: { select: { email: true } },
      user: { select: { email: true, createdAt: true, responsibleManagerId: true, responsibleManager: { select: { email: true } } } },
    },
  });
}

export async function listAgents(actor: Actor, filters: { status?: VerificationStatus; query?: string } = {}) {
  // This authorize call only gates whether the actor may call listAgents at
  // all — the self-referential ownerUserId/responsibleManagerId pair always
  // passes for a manager (they are always their own assigned manager), same
  // as listPlayers below. The actual scoping is the where-clause filter that
  // follows; skipping it here previously let any MANAGER list every agent in
  // the system, not just their own clients.
  authorize(actor, 'profile:readAny', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });

  const scope = actor.role === 'MANAGER' ? { user: { responsibleManagerId: actor.userId } } : {};

  return prisma.agentProfile.findMany({
    where: {
      ...scope,
      ...(filters.status ? { verificationStatus: filters.status } : {}),
      ...(filters.query
        ? {
            OR: [
              { firstName: { contains: filters.query, mode: 'insensitive' } },
              { lastName: { contains: filters.query, mode: 'insensitive' } },
              { agencyName: { contains: filters.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true, userId: true, firstName: true, lastName: true, country: true,
      agencyName: true, fifaLicenceNumber: true, verificationStatus: true,
      verifiedAt: true, markets: true, languages: true, updatedAt: true,
      user: { select: { email: true, status: true, createdAt: true } },
    },
    orderBy: [{ verificationStatus: 'asc' }, { updatedAt: 'desc' }],
    take: 100,
  });
}

/**
 * Licence verification.
 *
 * A self-entered FIFA licence number only ever produces PENDING. Moving to
 * VERIFIED is an ADMIN decision recorded against a named person — the platform
 * must never display a badge the user granted themselves.
 */
export async function setVerification(
  actor: Actor,
  agentUserId: string,
  status: VerificationStatus,
  note: string | null,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  authorize(actor, 'verification:decide', { ownerUserId: agentUserId });

  const profile = await prisma.agentProfile.findUnique({
    where: { userId: agentUserId },
    select: { id: true, verificationStatus: true },
  });
  if (!profile) throw new Error('Unknown agent');

  if (status === 'VERIFIED' && !note?.trim()) {
    // Granting a public credential requires a written basis, always.
    const error = new Error('A verification note is required') as Error & { code: string; messageKey: string };
    error.code = 'NOTE_REQUIRED';
    error.messageKey = 'admin.verificationNoteRequired';
    throw error;
  }

  const updated = await prisma.agentProfile.update({
    where: { id: profile.id },
    data: {
      verificationStatus: status,
      verificationNote: note,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
      verifiedByUserId: status === 'VERIFIED' ? actor.userId : null,
    },
    select: { id: true, verificationStatus: true, verifiedAt: true },
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: agentUserId,
    action: 'agent.verificationChanged', entityType: 'agentProfile', entityId: profile.id,
    metadata: { from: profile.verificationStatus, to: status }, ctx,
  });

  await notify({
    userId: agentUserId,
    type: 'verification.changed',
    titleKey: 'verificationChanged',
    entityType: 'agentProfile',
    entityId: profile.id,
    payload: { status },
  });

  return updated;
}
