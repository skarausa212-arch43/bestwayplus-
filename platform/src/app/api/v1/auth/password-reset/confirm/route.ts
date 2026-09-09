import { NextResponse } from 'next/server';
import { resetPassword as resetPasswordSchema } from '@/modules/auth/schemas';
import { resetPassword } from '@/modules/auth/password-reset';
import { requestContext } from '@/modules/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'validation.required' }, { status: 400 });

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'validation.required';
    return NextResponse.json({ ok: false, error }, { status: 422 });
  }

  const ctx = await requestContext();
  const result = await resetPassword(parsed.data.token, parsed.data.password, ctx);

  if (result === 'invalidToken') {
    return NextResponse.json({ ok: false, error: 'validation.resetTokenInvalid' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
