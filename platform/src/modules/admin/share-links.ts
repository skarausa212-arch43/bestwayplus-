import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { newToken, hashToken, hashPassword } from '@/lib/crypto';
import { recordActivity } from '@/modules/activity/service';
import { hasActiveConsent } from '@/modules/consent/service';

const MAX_DAYS = 90;

export interface ShareSections {
  identity: boolean;
  football: boolean;
  career: boolean;
  links: boolean;
}

/**
 * A tokenised, expiring, revocable view of one player profile.
 *
 * Three rules, all enforced here rather than in the UI:
 *   1. It cannot exist without the player's profile-sharing consent.
 *   2. Expiry is mandatory and capped.
 *   3. Nothing is included by default — sections and documents are opt-in,
 *      and documents must belong to that player.
 */
export async function createShareLink(
  actor: Actor,
  input: {
    playerUserId: string;
    sections: ShareSections;
    documentIds?: string[];
    expiresInDays: number;
    password?: string | null;
    recipientLabel?: string | null;
  },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  const owner = await prisma.user.findUnique({
    where: { id: input.playerUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) throw new Error('Unknown player');

  authorize(actor, 'shareLink:create', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  // Consent is a precondition, not a warning banner.
  if (!(await hasActiveConsent(owner.id, 'PROFILE_SHARING'))) {
    const error = new Error('Player has not consented to profile sharing') as Error & {
      code: string; messageKey: string;
    };
    error.code = 'CONSENT_MISSING';
    error.messageKey = 'admin.shareConsentMissing';
    throw error;
  }

  const days = Math.min(Math.max(Math.trunc(input.expiresInDays), 1), MAX_DAYS);

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: owner.id },
    select: { id: true },
  });
  if (!profile) throw new Error('Player has no profile');

  // Only documents that belong to this player, are approved and have cleared
  // scanning may be attached — a staff typo cannot attach someone else's file.
  const allowedDocumentIds = input.documentIds?.length
    ? (
        await prisma.document.findMany({
          where: {
            id: { in: input.documentIds },
            ownerUserId: owner.id,
            deletedAt: null,
            status: 'APPROVED',
            scanStatus: 'CLEAN',
          },
          select: { id: true },
        })
      ).map((document) => document.id)
    : [];

  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  const link = await prisma.shareLink.create({
    data: {
      playerProfileId: profile.id,
      createdByUserId: actor.userId,
      tokenHash: hash,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      recipientLabel: input.recipientLabel ?? null,
      allowedSections: input.sections as unknown as object,
      allowedDocumentIds,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: owner.id,
    action: 'shareLink.created', entityType: 'shareLink', entityId: link.id,
    metadata: {
      days,
      sections: Object.entries(input.sections).filter(([, on]) => on).map(([name]) => name),
      documentCount: allowedDocumentIds.length,
      passwordProtected: Boolean(input.password),
      recipientLabel: input.recipientLabel ?? null,
    },
    ctx,
  });

  // The plaintext token is returned once and never stored.
  return { id: link.id, token, expiresAt: link.expiresAt, documentCount: allowedDocumentIds.length };
}

export async function revokeShareLink(actor: Actor, linkId: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  const link = await prisma.shareLink.findUnique({
    where: { id: linkId },
    select: { id: true, playerProfile: { select: { userId: true, user: { select: { responsibleManagerId: true } } } } },
  });
  if (!link) throw new Error('Unknown link');

  authorize(actor, 'shareLink:create', {
    ownerUserId: link.playerProfile.userId,
    responsibleManagerId: link.playerProfile.user.responsibleManagerId,
  });

  await prisma.shareLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
  await recordActivity({
    actorUserId: actor.userId, subjectUserId: link.playerProfile.userId,
    action: 'shareLink.revoked', entityType: 'shareLink', entityId: linkId, ctx,
  });
}

/** Resolves a token for the public view. Never reveals why it failed. */
export async function resolveShareToken(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true, passwordHash: true, allowedSections: true, allowedDocumentIds: true,
      expiresAt: true, revokedAt: true,
      playerProfile: { select: { id: true, userId: true } },
    },
  });
  if (!link || link.revokedAt || link.expiresAt < new Date()) return null;
  return link;
}

export async function listShareLinks(actor: Actor, playerUserId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: playerUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) return [];

  authorize(actor, 'shareLink:readOwn', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  return prisma.shareLink.findMany({
    where: { playerProfile: { userId: playerUserId } },
    select: {
      id: true, recipientLabel: true, expiresAt: true, revokedAt: true,
      viewCount: true, lastViewedAt: true, createdAt: true,
      allowedDocumentIds: true,
      createdBy: { select: { email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
