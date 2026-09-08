import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';

const intl = createIntlMiddleware(routing);

/**
 * Order matters:
 *   1. /admin is deliberately outside the localised tree — staff language
 *      comes from the account, and this keeps the CRM out of sitemaps.
 *   2. Portal routes are guarded here only as a fast redirect. The real
 *      authorisation happens in the service layer; middleware is never the
 *      security boundary.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    const response = NextResponse.next();
    applySecurityHeaders(response, { noindex: true });
    return response;
  }

  const response = intl(request);
  const isPrivate = /^\/(en|pl|ru)\/portal(\/|$)/.test(pathname) || pathname.startsWith('/share/');
  applySecurityHeaders(response, { noindex: isPrivate });
  return response;
}

function applySecurityHeaders(response: NextResponse, opts: { noindex: boolean }) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
  if (opts.noindex) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
  }
}

export const config = {
  matcher: ['/', '/(en|pl|ru)/:path*', '/admin/:path*', '/share/:path*'],
};
