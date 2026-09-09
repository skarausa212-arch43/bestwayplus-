import { NextResponse } from 'next/server';
import { verifyEmailToken } from '@/modules/auth/schemas';
import { verifyEmail } from '@/modules/auth/email-verification';
import { requestContext } from '@/modules/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'validation.required' }, { status: 400 });

  const parsed = verifyEmailToken.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'validation.required' }, { status: 422 });

  const ctx = await requestContext();
  const result = await verifyEmail(parsed.data.token, ctx);

  if (result === 'invalidToken') {
    return NextResponse.json({ ok: false, error: 'validation.verifyTokenInvalid' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
