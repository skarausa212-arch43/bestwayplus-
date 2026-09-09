import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/crypto';
import { signIn } from '@/modules/auth/schemas';
import { createSession, requestContext } from '@/modules/auth/session';
import { recordActivity } from '@/modules/activity/service';

export const dynamic = 'force-dynamic';

const GENERIC_ERROR = { ok: false as const, error: 'validation.invalidCredentials' };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json(GENERIC_ERROR, { status: 400 });

  const parsed = signIn.safeParse(body);
  if (!parsed.success) return NextResponse.json(GENERIC_ERROR, { status: 422 });

  const { email, password } = parsed.data;
  const ctx = await requestContext();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, passwordHash: true, status: true, deletedAt: true, twoFactorEnabled: true,
    },
  });

  // Same generic message whether the email doesn't exist or the password is
  // wrong — telling the two apart lets an attacker enumerate accounts.
  // verifyPassword still runs against a stored hash either way (a fixed
  // dummy hash when there's no user) so a missing account doesn't respond
  // measurably faster than a wrong password.
  const hash = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const validPassword = await verifyPassword(hash, password);

  if (!user || !validPassword) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }
  if (user.deletedAt || user.status === 'SUSPENDED' || user.status === 'DELETED') {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }
  if (user.twoFactorEnabled) {
    // No account can actually reach this yet — nothing in the product sets
    // twoFactorEnabled — but the field exists on the model, so a future path
    // that does set it must not fall through to a plain password check.
    return NextResponse.json(
      { ok: false, error: 'validation.twoFactorUnavailable' },
      { status: 501 },
    );
  }

  await createSession(user.id, { ip: ctx.ip ?? undefined, userAgent: ctx.userAgent ?? undefined });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordActivity({ actorUserId: user.id, subjectUserId: user.id, action: 'SIGNED_IN', ctx });

  return NextResponse.json({ ok: true });
}
