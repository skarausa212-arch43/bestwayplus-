import type { AuthTokenPurpose } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hashToken, newToken } from '@/lib/crypto';

const TTL_HOURS: Record<AuthTokenPurpose, number> = {
  PASSWORD_RESET: 1,
  EMAIL_VERIFICATION: 24,
  TWO_FACTOR_RECOVERY: 24, // unused — 2FA isn't wired up yet
};

/**
 * Issues one single-use token for the given purpose. Any earlier unconsumed
 * token of the same purpose is left alone — it simply expires or gets
 * consumed first, whichever the user clicks — rather than invalidated here,
 * so a resend never breaks a link already in flight.
 */
export async function issueAuthToken(userId: string, purpose: AuthTokenPurpose): Promise<string> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + TTL_HOURS[purpose] * 3_600_000);
  await prisma.authToken.create({ data: { userId, purpose, tokenHash: hash, expiresAt } });
  return token;
}

/**
 * Looks up and consumes a token atomically-enough for this use: the
 * consumedAt check happens in the same query as the read, so two concurrent
 * confirms can't both succeed off one token.
 */
export async function consumeAuthToken(
  token: string,
  purpose: AuthTokenPurpose,
): Promise<{ userId: string } | null> {
  const hash = hashToken(token);
  const row = await prisma.authToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, userId: true, purpose: true, expiresAt: true, consumedAt: true },
  });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt < new Date()) return null;

  const { count } = await prisma.authToken.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) return null; // lost a race with another confirm

  return { userId: row.userId };
}
