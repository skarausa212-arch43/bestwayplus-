import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { issueSharedDownloadUrl } from '@/modules/share/service';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const body = z.object({ password: z.string().max(200).nullable().optional() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; documentId: string }> },
) {
  try {
    const { token, documentId } = await params;
    if (!z.string().uuid().safeParse(documentId).success) {
      return apiError(404, 'NOT_FOUND', 'share.unavailable');
    }

    const { password } = body.parse(await request.json().catch(() => ({})));
    const requestHeaders = await headers();

    const result = await issueSharedDownloadUrl(token, documentId, password ?? null, {
      ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: requestHeaders.get('user-agent'),
    });

    // A document outside this link's allow-list is indistinguishable from a
    // link that does not exist.
    if (!result) return apiError(404, 'NOT_FOUND', 'share.unavailable');

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
