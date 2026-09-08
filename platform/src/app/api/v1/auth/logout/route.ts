import { NextResponse } from 'next/server';
import { destroySession } from '@/modules/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  await destroySession();
  const url = new URL(request.url);
  return NextResponse.redirect(new URL('/en/sign-in', url.origin), { status: 303 });
}
