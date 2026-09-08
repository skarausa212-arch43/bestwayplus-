import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import type { Prisma } from '@prisma/client';

/**
 * What a document owner may see about their own files. `storageKey` is
 * deliberately absent — the client has no use for it and it is the one field
 * worth keeping out of every payload.
 */
const OWN_DOCUMENT_SELECT = {
  id: true, type: true, name: true, mimeType: true, sizeBytes: true,
  status: true, scanStatus: true, expiryDate: true,
  userComment: true, adminComment: true, deleteLocked: true,
  version: true, createdAt: true, updatedAt: true, reviewedAt: true,
} as const satisfies Prisma.DocumentSelect;

export const OWN_DOCUMENT_FIELDS = Object.keys(OWN_DOCUMENT_SELECT);

export async function listOwnDocuments(actor: Actor) {
  authorize(actor, 'document:readOwn', { ownerUserId: actor.userId });

  return prisma.document.findMany({
    where: { ownerUserId: actor.userId, deletedAt: null },
    select: OWN_DOCUMENT_SELECT,
    orderBy: [{ createdAt: 'desc' }],
  });
}

export async function listOwnRequests(actor: Actor) {
  authorize(actor, 'document:readOwn', { ownerUserId: actor.userId });

  return prisma.documentRequest.findMany({
    where: { targetUserId: actor.userId, status: 'OPEN' },
    select: {
      id: true, type: true, message: true, dueDate: true, createdAt: true,
      requestedBy: { select: { id: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });
}

/** Documents inside the warning window, used by the dashboard banner. */
export async function listExpiringSoon(actor: Actor, withinDays = 60) {
  authorize(actor, 'document:readOwn', { ownerUserId: actor.userId });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  return prisma.document.findMany({
    where: {
      ownerUserId: actor.userId,
      deletedAt: null,
      expiryDate: { not: null, lte: cutoff },
      status: { notIn: ['REJECTED'] },
    },
    select: { id: true, type: true, name: true, expiryDate: true, status: true },
    orderBy: { expiryDate: 'asc' },
  });
}

export async function countByStatus(actor: Actor) {
  authorize(actor, 'document:readOwn', { ownerUserId: actor.userId });

  const rows = await prisma.document.groupBy({
    by: ['status'],
    where: { ownerUserId: actor.userId, deletedAt: null },
    _count: { _all: true },
  });

  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}
