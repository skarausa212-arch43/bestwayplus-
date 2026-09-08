import { prisma } from '@/lib/db';
import { verifyPassword, hashToken } from '@/lib/crypto';
import { rateLimit } from '@/lib/rate-limit';
import { createDownloadUrl } from '@/modules/storage/client';
import { normaliseSections, projectProfile, type ShareSections } from './sections';

export interface ShareContext {
  ip?: string | null;
  userAgent?: string | null;
}

export type ShareResult =
  | { outcome: 'not-found' }
  | { outcome: 'password-required' }
  | { outcome: 'locked'; retryAfterSeconds: number }
  | { outcome: 'ok'; view: SharedView };

export interface SharedView {
  linkId: string;
  expiresAt: Date;
  sections: ShareSections;
  profile: Record<string, unknown>;
  documents: Array<{ id: string; type: string; name: string }>;
}

/**
 * Opens a share link.
 *
 * Failure is deliberately uniform: an unknown token, an expired link and a
 * revoked link all return `not-found`. Nothing about which of the three it was
 * reaches the caller, so the endpoint cannot be used to probe for live links.
 */
export async function openShareLink(
  token: string,
  password: string | null,
  ctx: ShareContext = {},
): Promise<ShareResult> {
  const tokenHash = hashToken(token);

  // Rate limited by token, so brute-forcing a password on one link cannot be
  // spread across addresses.
  const limit = await rateLimit(`share-open:${tokenHash}`, { limit: 10, windowSeconds: 900 });
  if (!limit.allowed) return { outcome: 'locked', retryAfterSeconds: limit.retryAfterSeconds };

  const link = await prisma.shareLink.findUnique({
    where: { tokenHash },
    select: {
      id: true, passwordHash: true, allowedSections: true, allowedDocumentIds: true,
      expiresAt: true, revokedAt: true,
      playerProfile: { select: { id: true, userId: true } },
    },
  });

  if (!link || link.revokedAt || link.expiresAt < new Date()) return { outcome: 'not-found' };

  if (link.passwordHash) {
    if (!password) return { outcome: 'password-required' };
    if (!(await verifyPassword(link.passwordHash, password))) return { outcome: 'password-required' };
  }

  const sections = normaliseSections(link.allowedSections);

  // The whole profile is read once and then projected down. The projection is
  // the control; the template only renders what survives it.
  const profile = await prisma.playerProfile.findUnique({
    where: { id: link.playerProfile.id },
    select: {
      firstName: true, lastName: true, dateOfBirth: true, nationality: true,
      secondNationality: true, countryOfResidence: true,
      primaryPosition: true, secondaryPosition: true, preferredFoot: true,
      heightCm: true, weightKg: true, currentClub: true, league: true, contractUntil: true,
      nationalTeamExperience: true, professionalExperience: true,
      careerSummary: true, careerGoals: true, availability: true,
      preferredCountries: true, preferredLeagues: true,
      transfermarktUrl: true, youtubeUrl: true, highlightsUrl: true, instagramUrl: true,
    },
  });
  if (!profile) return { outcome: 'not-found' };

  const documents = link.allowedDocumentIds.length
    ? await prisma.document.findMany({
        where: {
          id: { in: link.allowedDocumentIds },
          ownerUserId: link.playerProfile.userId,
          deletedAt: null,
          status: 'APPROVED',
          scanStatus: 'CLEAN',
        },
        select: { id: true, type: true, name: true },
      })
    : [];

  await prisma.$transaction([
    prisma.shareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    }),
    prisma.shareLinkView.create({
      data: { shareLinkId: link.id, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null },
    }),
  ]);

  return {
    outcome: 'ok',
    view: {
      linkId: link.id,
      expiresAt: link.expiresAt,
      sections,
      profile: projectProfile(profile as Record<string, unknown>, sections),
      documents,
    },
  };
}

/**
 * A download from inside a share view. The document must still be on that
 * link's allow-list — a recipient cannot swap in another id — and the access
 * log records the link rather than a user.
 */
export async function issueSharedDownloadUrl(
  token: string,
  documentId: string,
  password: string | null,
  ctx: ShareContext = {},
): Promise<{ url: string; expiresInSeconds: number } | null> {
  const opened = await openShareLink(token, password, ctx);
  if (opened.outcome !== 'ok') return null;
  if (!opened.view.documents.some((document) => document.id === documentId)) return null;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, storageKey: true, name: true, mimeType: true, scanStatus: true },
  });
  if (!document || document.scanStatus !== 'CLEAN') return null;

  const url = await createDownloadUrl({
    storageKey: document.storageKey,
    downloadName: document.name,
    mimeType: document.mimeType,
  });

  await prisma.documentAccessLog.create({
    data: {
      documentId: document.id,
      actorUserId: null,
      shareLinkId: opened.view.linkId,
      action: 'DOWNLOAD_URL_ISSUED',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });

  return url;
}
