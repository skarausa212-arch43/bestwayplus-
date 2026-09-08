import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import { CONSENT_POLICY_VERSION, consentTextHash, type ConsentKind } from './catalog';
import { toPrismaLocale, type AppLocale } from '@/i18n/routing';

/**
 * Consent is append-only. A grant writes a row; a withdrawal stamps revokedAt
 * on the live row and writes a matching `granted: false` row. The history is
 * the evidence, so nothing is ever updated in place beyond that stamp.
 */
export async function recordConsent(input: {
  userId: string;
  type: ConsentKind;
  granted: boolean;
  locale: AppLocale;
  ctx?: { ip?: string | null; userAgent?: string | null };
}): Promise<void> {
  if (!input.granted) {
    await prisma.consent.updateMany({
      where: { userId: input.userId, type: input.type, granted: true, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await prisma.consent.create({
    data: {
      userId: input.userId,
      type: input.type,
      granted: input.granted,
      policyVersion: CONSENT_POLICY_VERSION,
      textHash: consentTextHash(input.type, input.locale),
      locale: toPrismaLocale(input.locale),
      ip: input.ctx?.ip ?? null,
      userAgent: input.ctx?.userAgent ?? null,
    },
  });
}

/** True when the user currently holds an un-revoked grant of this type. */
export async function hasActiveConsent(userId: string, type: ConsentKind): Promise<boolean> {
  const row = await prisma.consent.findFirst({
    where: { userId, type, granted: true, revokedAt: null },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Withdrawing profile-sharing consent must have teeth: every live share link
 * for that player is revoked in the same transaction.
 */
export async function withdrawProfileSharing(
  actor: Actor,
  userId: string,
  locale: AppLocale,
  ctx?: { ip?: string | null; userAgent?: string | null },
): Promise<{ revokedLinks: number }> {
  authorize(actor, 'consent:manageOwn', { ownerUserId: userId });

  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  const [, revoked] = await prisma.$transaction([
    prisma.consent.updateMany({
      where: { userId, type: 'PROFILE_SHARING', granted: true, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    profile
      ? prisma.shareLink.updateMany({
          where: { playerProfileId: profile.id, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      : prisma.shareLink.updateMany({ where: { id: '00000000-0000-0000-0000-000000000000' }, data: {} }),
  ]);

  await recordConsent({ userId, type: 'PROFILE_SHARING', granted: false, locale, ctx });
  await recordActivity({
    actorUserId: actor.userId, subjectUserId: userId,
    action: 'consent.profileSharing.withdrawn',
    metadata: { revokedLinks: revoked.count }, ctx,
  });

  return { revokedLinks: revoked.count };
}
