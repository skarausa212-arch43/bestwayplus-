import { NextResponse } from 'next/server';
import { getSessionUser } from '@/modules/auth/session';
import { sendVerificationEmail } from '@/modules/auth/email-verification';
import { rateLimit, LIMITS } from '@/lib/rate-limit';
import { apiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSessionUser();
  if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

  const limit = await rateLimit(`verify-resend:${session.userId}`, LIMITS.verifyResend);
  if (!limit.allowed) return apiError(429, 'RATE_LIMITED', 'validation.tooManyAttempts');

  await sendVerificationEmail(session.userId);
  return NextResponse.json({ ok: true });
}
