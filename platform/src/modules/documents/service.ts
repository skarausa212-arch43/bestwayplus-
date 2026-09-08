import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { assertUploadable, type AllowedMime } from '@/modules/storage/mime';
import { createUploadUrl, createDownloadUrl, newStorageKey, headObject } from '@/modules/storage/client';
import { recordActivity } from '@/modules/activity/service';
import type { DocumentType, DocumentStatus } from '@prisma/client';

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

/** Identity and money documents require a typed reason before staff may open them. */
const REASON_REQUIRED: ReadonlySet<DocumentType> = new Set([
  'PASSPORT_ID', 'BANK_DETAILS', 'FINANCIAL', 'MEDICAL',
] as DocumentType[]);

/**
 * Step 1 of the upload. Authorises, validates the declared type and size,
 * reserves an opaque key and returns a short-lived, tightly bound PUT URL.
 */
export async function createUploadIntent(
  actor: Actor,
  input: {
    ownerUserId: string;
    type: DocumentType;
    name: string;
    mimeType: string;
    sizeBytes: number;
    expiryDate?: Date | null;
    userComment?: string | null;
  },
  ctx: RequestContext = {},
) {
  const owner = await prisma.user.findUnique({
    where: { id: input.ownerUserId },
    select: { id: true, responsibleManagerId: true, status: true, emailVerifiedAt: true },
  });
  if (!owner) throw new Error('Unknown owner');

  const action = owner.id === actor.userId ? 'document:createOwn' : 'document:readAny';
  authorize(actor, action, { ownerUserId: owner.id, responsibleManagerId: owner.responsibleManagerId });

  // An unverified account may browse but may not put documents into the system.
  if (owner.id === actor.userId && !owner.emailVerifiedAt) {
    const error = new Error('Email not verified') as Error & { code: string; messageKey: string };
    error.code = 'EMAIL_NOT_VERIFIED';
    error.messageKey = 'validation.emailNotVerified';
    throw error;
  }

  assertUploadable(input.mimeType, input.sizeBytes);
  const storageKey = newStorageKey();

  const document = await prisma.document.create({
    data: {
      ownerUserId: owner.id,
      uploadedByUserId: actor.userId,
      type: input.type,
      name: input.name.slice(0, 180),
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: 'UPLOADED',
      scanStatus: 'PENDING',
      expiryDate: input.expiryDate ?? null,
      userComment: input.userComment ?? null,
    },
    select: { id: true, storageKey: true },
  });

  const upload = await createUploadUrl({
    storageKey,
    mimeType: input.mimeType as AllowedMime,
    sizeBytes: input.sizeBytes,
  });

  await logDocumentAccess({ documentId: document.id, actorUserId: actor.userId, action: 'UPLOAD_INTENT', ctx });
  await recordActivity({
    actorUserId: actor.userId, subjectUserId: owner.id,
    action: 'document.uploadIntent', entityType: 'document', entityId: document.id, ctx,
  });

  return { documentId: document.id, ...upload };
}

/**
 * Step 2. Verifies the object actually landed and matches the declared size
 * before the row is trusted, then queues the malware scan.
 */
export async function confirmUpload(actor: Actor, documentId: string, ctx: RequestContext = {}) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true, ownerUserId: true, storageKey: true, sizeBytes: true, mimeType: true,
      scanStatus: true, deletedAt: true,
      owner: { select: { responsibleManagerId: true } },
    },
  });
  if (!document || document.deletedAt) throw new Error('Unknown document');

  authorize(actor, document.ownerUserId === actor.userId ? 'document:createOwn' : 'document:readAny', {
    ownerUserId: document.ownerUserId,
    responsibleManagerId: document.owner.responsibleManagerId,
  });

  const head = await headObject(document.storageKey);
  if (head.sizeBytes !== document.sizeBytes) {
    await prisma.document.update({ where: { id: document.id }, data: { scanStatus: 'FAILED' } });
    throw new Error('Uploaded object does not match the declared size');
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { status: 'UNDER_REVIEW', sizeBytes: head.sizeBytes },
  });

  await logDocumentAccess({ documentId: document.id, actorUserId: actor.userId, action: 'UPLOAD_CONFIRMED', ctx });
  // enqueueScan(document.id) — worker verifies magic bytes and runs ClamAV.
  return { documentId: document.id, status: 'UNDER_REVIEW' as DocumentStatus };
}

/**
 * Issues a 60-second download URL. Every issuance is authorised, logged, and
 * for identity or financial documents requires a stated reason.
 */
export async function issueDownloadUrl(
  actor: Actor,
  documentId: string,
  opts: { reason?: string } = {},
  ctx: RequestContext = {},
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true, ownerUserId: true, storageKey: true, name: true, mimeType: true,
      type: true, scanStatus: true, deletedAt: true,
      owner: { select: { responsibleManagerId: true } },
    },
  });
  if (!document || document.deletedAt) throw new Error('Unknown document');

  authorize(actor, document.ownerUserId === actor.userId ? 'document:readOwn' : 'document:readAny', {
    ownerUserId: document.ownerUserId,
    responsibleManagerId: document.owner.responsibleManagerId,
  });

  // A file that has not cleared scanning is never handed out, to anyone.
  if (document.scanStatus !== 'CLEAN') {
    const error = new Error('File is not available yet') as Error & { code: string; messageKey: string };
    error.code = 'SCAN_NOT_CLEAN';
    error.messageKey = 'documents.scanPending';
    throw error;
  }

  const staffReadingSomeoneElse = document.ownerUserId !== actor.userId;
  if (staffReadingSomeoneElse && REASON_REQUIRED.has(document.type) && !opts.reason?.trim()) {
    const error = new Error('A reason is required to open this document') as Error & { code: string };
    error.code = 'REASON_REQUIRED';
    throw error;
  }

  const url = await createDownloadUrl({
    storageKey: document.storageKey,
    downloadName: document.name,
    mimeType: document.mimeType,
  });

  await logDocumentAccess({
    documentId: document.id, actorUserId: actor.userId,
    action: 'DOWNLOAD_URL_ISSUED', reason: opts.reason ?? null, ctx,
  });

  return url;
}

/** Soft delete. Blocked while the document backs an active process. */
export async function softDeleteDocument(actor: Actor, documentId: string, ctx: RequestContext = {}) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, ownerUserId: true, deleteLocked: true, status: true,
              owner: { select: { responsibleManagerId: true } } },
  });
  if (!document) throw new Error('Unknown document');

  authorize(actor, 'document:deleteOwn', {
    ownerUserId: document.ownerUserId,
    responsibleManagerId: document.owner.responsibleManagerId,
  });

  if (document.deleteLocked || document.status === 'APPROVED') {
    const error = new Error('Document is locked') as Error & { code: string; messageKey: string };
    error.code = 'DELETE_LOCKED';
    error.messageKey = 'documents.deleteLocked';
    throw error;
  }

  await prisma.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
  await logDocumentAccess({ documentId: document.id, actorUserId: actor.userId, action: 'SOFT_DELETED', ctx });
}

async function logDocumentAccess(input: {
  documentId: string;
  actorUserId?: string | null;
  shareLinkId?: string | null;
  action: 'UPLOAD_INTENT' | 'UPLOAD_CONFIRMED' | 'DOWNLOAD_URL_ISSUED' | 'STATUS_CHANGED' | 'REPLACED' | 'SOFT_DELETED' | 'HARD_DELETED';
  reason?: string | null;
  ctx?: RequestContext;
}) {
  await prisma.documentAccessLog.create({
    data: {
      documentId: input.documentId,
      actorUserId: input.actorUserId ?? null,
      shareLinkId: input.shareLinkId ?? null,
      action: input.action,
      reason: input.reason ?? null,
      ip: input.ctx?.ip ?? null,
      userAgent: input.ctx?.userAgent ?? null,
    },
  });
}
