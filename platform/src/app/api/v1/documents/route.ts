import { NextResponse } from 'next/server';
import { getSessionUser } from '@/modules/auth/session';
import { listOwnDocuments } from '@/modules/documents/queries';
import { apiError, handleApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'common.errorGeneric');

    const documents = await listOwnDocuments(session);
    return NextResponse.json({ documents }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
