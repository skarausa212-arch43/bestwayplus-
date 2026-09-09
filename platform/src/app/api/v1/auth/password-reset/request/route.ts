import { NextResponse } from 'next/server';
import { forgotPassword } from '@/modules/auth/schemas';
import { requestPasswordReset } from '@/modules/auth/password-reset';
import { requestContext } from '@/modules/auth/session';
import { rateLimit, LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'validation.required' }, { status: 400 });

  const parsed = forgotPassword.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'validation.email' }, { status: 422 });

  const ctx = await requestContext();

  // Keyed by IP, not by the submitted email — keying by email would let an
  // attacker exhaust a victim's quota and block their real reset request.
  const limit = await rateLimit(`password-reset:${ctx.ip ?? 'unknown'}`, LIMITS.passwordReset);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: 'validation.tooManyAttempts' }, { status: 429 });
  }

  await requestPasswordReset(parsed.data.email, ctx);

  // Same response whether or not the address has an account.
  return NextResponse.json({ ok: true });
}
