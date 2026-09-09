import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import { notify } from '@/modules/notifications/service';
import type { Foot, TransferType } from '@prisma/client';

type Ctx = { ip?: string | null; userAgent?: string | null };

const REQUEST_SELECT = {
  id: true, position: true, ageMin: true, ageMax: true, preferredFoot: true,
  nationalityRestrictions: true, salaryBudget: true, transferType: true,
  deadline: true, additionalRequirements: true, status: true, createdAt: true,
  clubUser: { select: { id: true, email: true } },
  assignedTo: { select: { id: true, email: true } },
} as const;

export interface RecruitmentInput {
  position?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  preferredFoot?: Foot | null;
  nationalityRestrictions?: string | null;
  salaryBudget?: string | null;
  transferType?: TransferType | null;
  deadline?: Date | null;
  additionalRequirements?: string | null;
}

/** CLUB submits its own briefs — recruitment:submit is an 'own' grant. */
export async function listOwn(actor: Actor) {
  authorize(actor, 'recruitment:submit', { ownerUserId: actor.userId });

  return prisma.recruitmentRequest.findMany({
    where: { clubUserId: actor.userId },
    select: REQUEST_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

export async function createRequest(actor: Actor, data: RecruitmentInput, ctx: Ctx = {}) {
  authorize(actor, 'recruitment:submit', { ownerUserId: actor.userId });

  const created = await prisma.recruitmentRequest.create({
    data: { ...data, clubUserId: actor.userId },
    select: REQUEST_SELECT,
  });

  await recordActivity({
    actorUserId: actor.userId, action: 'recruitment.created',
    entityType: 'recruitmentRequest', entityId: created.id, ctx,
  });

  return created;
}

/**
 * recruitment:manage is an unscoped 'allow' for every staff role, same as
 * task:manage — every manager sees the shared queue, not just their own
 * clients' clubs.
 */
export async function listForStaff(
  actor: Actor,
  filters: { status?: string; assigneeUserId?: string } = {},
) {
  authorize(actor, 'recruitment:manage');

  return prisma.recruitmentRequest.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assigneeUserId ? { assignedToUserId: filters.assigneeUserId } : {}),
    },
    select: REQUEST_SELECT,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export async function assignRequest(
  actor: Actor,
  requestId: string,
  assigneeUserId: string,
  ctx: Ctx = {},
) {
  authorize(actor, 'recruitment:manage');

  const updated = await prisma.recruitmentRequest.update({
    where: { id: requestId },
    data: { assignedToUserId: assigneeUserId, status: 'IN_PROGRESS' },
    select: REQUEST_SELECT,
  });

  if (assigneeUserId !== actor.userId) {
    await notify({
      userId: assigneeUserId,
      type: 'recruitment.assigned',
      titleKey: 'recruitmentAssigned',
      entityType: 'recruitmentRequest',
      entityId: requestId,
    });
  }

  await recordActivity({
    actorUserId: actor.userId, action: 'recruitment.assigned',
    entityType: 'recruitmentRequest', entityId: requestId, ctx,
  });

  return updated;
}

export async function updateStatus(
  actor: Actor,
  requestId: string,
  status: string,
  ctx: Ctx = {},
) {
  authorize(actor, 'recruitment:manage');

  const updated = await prisma.recruitmentRequest.update({
    where: { id: requestId },
    data: { status },
    select: REQUEST_SELECT,
  });

  await notify({
    userId: updated.clubUser.id,
    type: 'recruitment.statusChanged',
    titleKey: 'recruitmentUpdated',
    entityType: 'recruitmentRequest',
    entityId: requestId,
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: updated.clubUser.id, action: 'recruitment.statusChanged',
    entityType: 'recruitmentRequest', entityId: requestId, metadata: { status }, ctx,
  });

  return updated;
}
