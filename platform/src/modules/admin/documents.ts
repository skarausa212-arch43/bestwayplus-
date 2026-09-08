import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import { notify } from '@/modules/notifications/service';
import { refreshCompletion } from '@/modules/players/service';
import type { DocumentStatus, DocumentType } from '@prisma/client';

/** The review queue: what staff are actually here to do. */
export async function reviewQueue(actor: Actor, { take = 50 }: { take?: number } = {}) {
  authorize(actor, 'document:review', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });

  const scope = actor.role === 'MANAGER' ? { owner: { responsibleManagerId: actor.userId } } : {};

  return prisma.document.findMany({
    where: { ...scope, deletedAt: null, status: { in: ['UPLOADED', 'UNDER_REVIEW'] } },
    select: {
      id: true, type: true, name: true, status: true, scanStatus: true,
      sizeBytes: true, createdAt: true, expiryDate: true,
      owner: { select: { id: true, email: true, role: true } },
    },
    orderBy: [{ createdAt: 'asc' }],
    take,
  });
}

export async function reviewDocument(
  actor: Actor,
  documentId: string,
  decision: Extract<DocumentStatus, 'APPROVED' | 'ACTION_REQUIRED' | 'REJECTED'>,
  comment: string | null,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true, ownerUserId: true, type: true, status: true, scanStatus: true,
      owner: { select: { responsibleManagerId: true, role: true } },
    },
  });
  if (!document || document.status === undefined) throw new Error('Unknown document');

  authorize(actor, 'document:review', {
    ownerUserId: document.ownerUserId,
    responsibleManagerId: document.owner.responsibleManagerId,
  });

  // Approving a file that has not cleared scanning would put an unscanned
  // object into an active process. Refuse it.
  if (decision === 'APPROVED' && document.scanStatus !== 'CLEAN') {
    const error = new Error('Document has not cleared scanning') as Error & { code: string; messageKey: string };
    error.code = 'SCAN_NOT_CLEAN';
    error.messageKey = 'documents.scanPending';
    throw error;
  }
  if (decision !== 'APPROVED' && !comment?.trim()) {
    const error = new Error('A comment is required') as Error & { code: string; messageKey: string };
    error.code = 'COMMENT_REQUIRED';
    error.messageKey = 'admin.reviewCommentRequired';
    throw error;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.document.update({
      where: { id: document.id },
      data: {
        status: decision,
        adminComment: comment,
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
        // Approval binds the file to a process, so the owner can no longer
        // delete it unilaterally.
        deleteLocked: decision === 'APPROVED' ? true : undefined,
      },
      select: { id: true, status: true, type: true },
    });

    if (decision === 'APPROVED') {
      await tx.documentRequest.updateMany({
        where: { targetUserId: document.ownerUserId, type: document.type, status: 'OPEN' },
        data: { status: 'FULFILLED', fulfilledDocumentId: document.id, closedAt: new Date() },
      });
    }

    return saved;
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: document.ownerUserId,
    action: 'document.reviewed', entityType: 'document', entityId: document.id,
    metadata: { decision, type: document.type }, ctx,
  });

  await notify({
    userId: document.ownerUserId,
    type: decision === 'APPROVED' ? 'document.approved' : 'document.rejected',
    titleKey: decision === 'APPROVED' ? 'docApproved' : 'docRejected',
    entityType: 'document', entityId: document.id,
  });

  if (document.owner.role === 'PLAYER') await refreshCompletion(document.ownerUserId);
  return updated;
}

export async function requestDocument(
  actor: Actor,
  input: { targetUserId: string; type: DocumentType; message: string; dueDate?: Date | null },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  authorize(actor, 'document:request', { ownerUserId: input.targetUserId });

  const created = await prisma.documentRequest.create({
    data: {
      targetUserId: input.targetUserId,
      requestedByUserId: actor.userId,
      type: input.type,
      message: input.message.slice(0, 1000),
      dueDate: input.dueDate ?? null,
    },
    select: { id: true, type: true, dueDate: true },
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: input.targetUserId,
    action: 'document.requested', entityType: 'documentRequest', entityId: created.id,
    metadata: { type: input.type }, ctx,
  });

  await notify({
    userId: input.targetUserId,
    type: 'document.requested',
    titleKey: 'docRequested',
    bodyKey: 'docRequestedBody',
    payload: { type: input.type, message: input.message },
    entityType: 'documentRequest',
    entityId: created.id,
  });

  return created;
}
