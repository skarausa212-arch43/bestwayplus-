import { prisma } from '@/lib/db';

/**
 * Append-only history. Never updated, never deleted by the application —
 * retention is a partition drop, and GDPR erasure pseudonymises rather than
 * removes, because a record that processing happened is itself required.
 */
export async function recordActivity(input: {
  actorUserId?: string | null;
  subjectUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ctx?: { ip?: string | null; userAgent?: string | null };
}): Promise<void> {
  await prisma.activityLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: (input.metadata ?? undefined) as never,
      ip: input.ctx?.ip ?? null,
      userAgent: input.ctx?.userAgent ?? null,
    },
  });
}
