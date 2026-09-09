import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import { notify } from '@/modules/notifications/service';
import type { TaskPriority, TaskStatus } from '@prisma/client';

type Ctx = { ip?: string | null; userAgent?: string | null };

const TASK_SELECT = {
  id: true, title: true, description: true, priority: true, status: true,
  dueDate: true, completedAt: true, createdAt: true,
  relatedUser: { select: { id: true, email: true, role: true } },
  assignee: { select: { id: true, email: true } },
  createdBy: { select: { id: true, email: true } },
} as const;

/**
 * task:manage is an unscoped 'allow' for every staff role in the RBAC
 * matrix — unlike profile:readAny, there is no 'assigned' grant for it, so
 * this stays a shared team list rather than filtered per manager. That is
 * the permission as already defined, not a choice made here.
 */
export async function listTasks(
  actor: Actor,
  filters: { status?: TaskStatus; assigneeUserId?: string; priority?: TaskPriority } = {},
) {
  authorize(actor, 'task:manage');

  return prisma.taskItem.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assigneeUserId ? { assigneeUserId: filters.assigneeUserId } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
    },
    select: TASK_SELECT,
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export async function createTask(
  actor: Actor,
  data: {
    title: string;
    description?: string | null;
    /** Resolved to a user id server-side — no generic person picker exists to build a dropdown from. */
    relatedUserEmail?: string | null;
    assigneeUserId?: string | null;
    dueDate?: Date | null;
    priority?: TaskPriority;
  },
  ctx: Ctx = {},
) {
  authorize(actor, 'task:manage');

  let relatedUserId: string | null = null;
  if (data.relatedUserEmail) {
    const related = await prisma.user.findUnique({ where: { email: data.relatedUserEmail }, select: { id: true } });
    if (!related) {
      const error = new Error('Unknown user') as Error & { code: string; messageKey: string };
      error.code = 'NOT_FOUND';
      error.messageKey = 'opportunities.candidateNotFound';
      throw error;
    }
    relatedUserId = related.id;
  }

  const created = await prisma.taskItem.create({
    data: {
      title: data.title, description: data.description, relatedUserId,
      assigneeUserId: data.assigneeUserId, dueDate: data.dueDate, priority: data.priority,
      createdByUserId: actor.userId,
    },
    select: TASK_SELECT,
  });

  if (created.assignee && created.assignee.id !== actor.userId) {
    await notify({
      userId: created.assignee.id,
      type: 'task.assigned',
      titleKey: 'taskAssigned',
      entityType: 'task',
      entityId: created.id,
    });
  }

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: created.relatedUser?.id ?? null,
    action: 'task.created', entityType: 'task', entityId: created.id, ctx,
  });

  return created;
}

export async function updateTask(
  actor: Actor,
  taskId: string,
  patch: {
    status?: TaskStatus;
    assigneeUserId?: string | null;
    priority?: TaskPriority;
    dueDate?: Date | null;
  },
  ctx: Ctx = {},
) {
  authorize(actor, 'task:manage');

  const existing = await prisma.taskItem.findUnique({ where: { id: taskId }, select: { status: true, assigneeUserId: true } });
  if (!existing) throw new Error('Unknown task');

  const updated = await prisma.taskItem.update({
    where: { id: taskId },
    data: {
      ...patch,
      completedAt: patch.status === 'DONE' ? new Date() : patch.status ? null : undefined,
    },
    select: TASK_SELECT,
  });

  if (patch.assigneeUserId && patch.assigneeUserId !== existing.assigneeUserId && patch.assigneeUserId !== actor.userId) {
    await notify({
      userId: patch.assigneeUserId,
      type: 'task.assigned',
      titleKey: 'taskAssigned',
      entityType: 'task',
      entityId: taskId,
    });
  }

  await recordActivity({
    actorUserId: actor.userId, action: 'task.updated', entityType: 'task', entityId: taskId,
    metadata: { from: existing.status, patch }, ctx,
  });

  return updated;
}
