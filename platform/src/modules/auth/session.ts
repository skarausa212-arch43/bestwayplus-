import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { hashToken, newToken } from '@/lib/crypto';
import type { Actor } from '@/modules/rbac/authorize';
import { isStaff, type Role } from '@/modules/rbac/permissions';

const COOKIE = 'bwf_session';
const SESSION_TTL_DAYS = 14;

export interface SessionUser extends Actor {
  email: string;
  locale: 'EN' | 'PL' | 'RU';
  status: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

/**
 * Sessions are database-backed rather than stateless, so staff can revoke a
 * session and a user can see and end their own from Settings. The cookie
 * carries an opaque token; only its peppered hash is stored.
 */
export async function createSession(userId: string, ctx: { ip?: string; userAgent?: string }) {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: { userId, tokenHash: hash, expiresAt, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null },
  });

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return { expiresAt };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(COOKIE);
}

/**
 * Resolves the caller. Returns null rather than throwing, so public pages can
 * call it freely; anything protected passes the result to authorize(), which
 * fails closed on null.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true, email: true, role: true, locale: true, status: true,
          emailVerifiedAt: true, twoFactorEnabled: true, deletedAt: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const user = session.user;
  if (!user || user.deletedAt || user.status === 'SUSPENDED' || user.status === 'DELETED') return null;

  const role = user.role as Role;

  // Staff carry their assignment list so 'assigned' grants can be evaluated
  // without a second query inside every service call.
  let managedUserIds: string[] | undefined;
  if (isStaff(role)) {
    const managed = await prisma.user.findMany({
      where: { responsibleManagerId: user.id },
      select: { id: true },
    });
    managedUserIds = managed.map((m) => m.id);
  }

  return {
    userId: user.id,
    role,
    managedUserIds,
    email: user.email,
    locale: user.locale,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    twoFactorEnabled: user.twoFactorEnabled,
  };
}

/** Request metadata for audit rows. */
export async function requestContext() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  };
}
