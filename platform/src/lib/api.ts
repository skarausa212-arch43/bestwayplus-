import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthenticationError, AuthorizationError } from '@/modules/rbac/authorize';

export interface ApiErrorBody {
  error: {
    code: string;
    /** i18n key — the client renders it in the reader's language. */
    messageKey: string;
    fields?: Record<string, string>;
  };
}

/**
 * One error shape for the whole API. The server never sends a display string;
 * it sends a key, which is what makes the API trilingual for free.
 */
export function apiError(status: number, code: string, messageKey: string, fields?: Record<string, string>) {
  return NextResponse.json<ApiErrorBody>({ error: { code, messageKey, fields } }, { status });
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const path = issue.path.join('.');
      if (path && !fields[path]) fields[path] = issue.message;
    }
    return apiError(422, 'VALIDATION_FAILED', 'common.errorGeneric', fields);
  }
  if (error instanceof AuthenticationError) {
    return apiError(401, error.code, 'common.errorGeneric');
  }
  if (error instanceof AuthorizationError) {
    return apiError(403, error.code, 'common.errorGeneric');
  }

  const typed = error as { code?: string; messageKey?: string };
  if (typed?.code && typed?.messageKey) {
    const status =
      typed.code === 'UNSUPPORTED_MEDIA_TYPE' ? 415 :
      typed.code === 'PAYLOAD_TOO_LARGE' ? 413 :
      typed.code === 'DELETE_LOCKED' ? 409 :
      typed.code === 'EMAIL_NOT_VERIFIED' ? 403 : 400;
    return apiError(status, typed.code, typed.messageKey);
  }

  // Never leak an internal message to the client.
  console.error('[api] unhandled', error);
  return apiError(500, 'INTERNAL', 'common.errorGeneric');
}
