import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';

export interface NotifyInput {
  userId: string;
  type: string;
  /** i18n key under the `notifications` namespace. */
  titleKey: string;
  bodyKey?: string;
  payload?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  /** Transactional mail is not suppressible; security mail ignores preferences. */
  email?: boolean;
}

/**
 * One emitter. Writes the in-app row now and queues the localised email — the
 * recipient's own `users.locale` decides the language, never the language of
 * the staff member who triggered it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const recipient = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, locale: true, status: true },
  });
  if (!recipient || recipient.status === 'DELETED') return;

  await prisma.notification.create({
    data: {
      userId: recipient.id,
      type: input.type,
      titleKey: input.titleKey,
      bodyKey: input.bodyKey ?? null,
      payload: (input.payload ?? undefined) as never,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });

  // enqueueEmail({ userId, locale: recipient.locale, template: input.type })
  // — the worker renders from src/messages/<locale>/emails.json.
}

export async function listOwn(actor: Actor, { take = 30 }: { take?: number } = {}) {
  authorize(actor, 'activity:readOwn', { ownerUserId: actor.userId });

  return prisma.notification.findMany({
    where: { userId: actor.userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true, type: true, titleKey: true, bodyKey: true, payload: true,
      entityType: true, entityId: true, readAt: true, createdAt: true,
    },
  });
}

export async function unreadCount(actor: Actor): Promise<number> {
  return prisma.notification.count({ where: { userId: actor.userId, readAt: null } });
}

export async function markAllRead(actor: Actor): Promise<void> {
  authorize(actor, 'activity:readOwn', { ownerUserId: actor.userId });
  await prisma.notification.updateMany({
    where: { userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });
}
