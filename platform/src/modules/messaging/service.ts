import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { notify } from '@/modules/notifications/service';
import { recordActivity } from '@/modules/activity/service';
import { isStaff } from '@/modules/rbac/permissions';

/**
 * A conversation is readable only by its participants — staff included. A
 * staff member with 'message:readAny' can open a thread they are not on, but
 * that is a separate, audited action rather than a side effect of listing.
 */
async function assertParticipant(actor: Actor, conversationId: string) {
  const membership = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: actor.userId } },
    select: { userId: true },
  });
  if (membership) return;

  authorize(actor, 'message:readAny', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });
}

export async function listConversations(actor: Actor) {
  authorize(actor, 'message:withStaff', { ownerUserId: actor.userId });

  const rows = await prisma.conversation.findMany({
    where: { participants: { some: { userId: actor.userId } } },
    select: {
      id: true, subject: true, lastMessageAt: true, createdAt: true,
      participants: {
        select: { userId: true, lastReadAt: true, user: { select: { email: true, role: true } } },
      },
      messages: {
        select: { id: true, body: true, createdAt: true, senderUserId: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  });

  return rows.map((row) => {
    const mine = row.participants.find((p) => p.userId === actor.userId);
    const last = row.messages[0];
    const unread = Boolean(
      last && last.senderUserId !== actor.userId && (!mine?.lastReadAt || mine.lastReadAt < last.createdAt),
    );
    return { ...row, unread };
  });
}

export async function getConversation(actor: Actor, conversationId: string) {
  await assertParticipant(actor, conversationId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, subject: true, createdAt: true,
      participants: { select: { userId: true, user: { select: { email: true, role: true } } } },
      messages: {
        where: { deletedAt: null },
        select: {
          id: true, body: true, createdAt: true, senderUserId: true,
          sender: { select: { email: true, role: true } },
          attachments: { select: { document: { select: { id: true, type: true, name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 300,
      },
    },
  });
  if (!conversation) return null;

  // Opening a thread marks it read for the caller only.
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId: actor.userId },
    data: { lastReadAt: new Date() },
  });

  return conversation;
}

export async function sendMessage(
  actor: Actor,
  conversationId: string,
  body: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  await assertParticipant(actor, conversationId);

  const trimmed = body.trim();
  if (!trimmed) {
    const error = new Error('Empty message') as Error & { code: string; messageKey: string };
    error.code = 'EMPTY_MESSAGE';
    error.messageKey = 'validation.required';
    throw error;
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, senderUserId: actor.userId, body: trimmed.slice(0, 8000) },
      select: { id: true, body: true, createdAt: true, senderUserId: true },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    }),
    prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: actor.userId },
      data: { lastReadAt: new Date() },
    }),
  ]);

  const recipients = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: actor.userId }, muted: false },
    select: { userId: true },
  });

  await Promise.all(
    recipients.map((recipient) =>
      notify({
        userId: recipient.userId,
        type: 'message.received',
        titleKey: 'newMessage',
        entityType: 'conversation',
        entityId: conversationId,
      }),
    ),
  );

  await recordActivity({
    actorUserId: actor.userId,
    action: 'message.sent',
    entityType: 'conversation',
    entityId: conversationId,
    ctx,
  });

  return message;
}

/**
 * Opens or reuses the single thread between a client and the team. Clients do
 * not choose a recipient — they write to Bestway, and the assigned manager
 * (or any staff member) answers.
 */
export async function ensureStaffConversation(actor: Actor) {
  authorize(actor, 'message:withStaff', { ownerUserId: actor.userId });
  if (isStaff(actor.role)) throw new Error('Staff open threads from the CRM');

  const existing = await prisma.conversation.findFirst({
    where: { participants: { some: { userId: actor.userId } } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { responsibleManagerId: true },
  });

  const staffId = user?.responsibleManagerId
    ?? (await prisma.user.findFirst({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    }))?.id;

  return prisma.conversation.create({
    data: {
      createdByUserId: actor.userId,
      participants: {
        create: [
          { userId: actor.userId },
          ...(staffId && staffId !== actor.userId ? [{ userId: staffId }] : []),
        ],
      },
    },
    select: { id: true },
  });
}
