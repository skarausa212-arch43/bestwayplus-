import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import { notify } from '@/modules/notifications/service';
import { CLIENT_PARTICIPANT_SELECT } from './select';
import type { Stage } from '@prisma/client';

/** Transitions a client may drive themselves. Everything else is staff-only. */
const CLIENT_TRANSITIONS: Partial<Record<Stage, readonly Stage[]>> = {
  NEW: ['PROFILE_UNDER_REVIEW', 'CLOSED'],
  INFO_REQUESTED: ['SUBMITTED'],
};

export async function listForParticipant(actor: Actor) {
  authorize(actor, 'opportunity:readAsParticipant', { ownerUserId: actor.userId });

  return prisma.opportunityParticipant.findMany({
    where: { userId: actor.userId, opportunity: { status: { not: 'DRAFT' } } },
    select: CLIENT_PARTICIPANT_SELECT,
    orderBy: [{ lastStageChangeAt: 'desc' }],
  });
}

export async function getForParticipant(actor: Actor, opportunityId: string) {
  authorize(actor, 'opportunity:readAsParticipant', { ownerUserId: actor.userId });

  // Scoped by userId, so an id from another participant returns nothing rather
  // than a forbidden — an unrelated opportunity should not even be confirmed
  // to exist.
  return prisma.opportunityParticipant.findFirst({
    where: {
      opportunityId,
      userId: actor.userId,
      opportunity: { status: { not: 'DRAFT' } },
    },
    select: CLIENT_PARTICIPANT_SELECT,
  });
}

export async function respond(
  actor: Actor,
  opportunityId: string,
  response: 'INTERESTED' | 'DECLINE' | 'INFO_PROVIDED',
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  authorize(actor, 'opportunity:respond', { ownerUserId: actor.userId });

  const participant = await prisma.opportunityParticipant.findFirst({
    where: { opportunityId, userId: actor.userId },
    select: { id: true, stage: true, opportunity: { select: { createdByUserId: true, name: true } } },
  });
  if (!participant) throw new Error('Unknown opportunity');

  const target: Stage =
    response === 'DECLINE' ? 'CLOSED'
    : response === 'INFO_PROVIDED' ? 'SUBMITTED'
    : 'PROFILE_UNDER_REVIEW';

  const allowed = CLIENT_TRANSITIONS[participant.stage] ?? [];
  if (!allowed.includes(target)) {
    const error = new Error('Stage transition not available') as Error & { code: string; messageKey: string };
    error.code = 'STAGE_NOT_ALLOWED';
    error.messageKey = 'opportunities.stageNotAllowed';
    throw error;
  }

  const updated = await prisma.opportunityParticipant.update({
    where: { id: participant.id },
    data: {
      stage: target,
      lastStageChangeAt: new Date(),
      submittedAt: target === 'SUBMITTED' ? new Date() : undefined,
    },
    select: { id: true, stage: true },
  });

  await recordActivity({
    actorUserId: actor.userId,
    subjectUserId: actor.userId,
    action: 'opportunity.responded',
    entityType: 'opportunity',
    entityId: opportunityId,
    metadata: { response, stage: target },
    ctx,
  });

  await notify({
    userId: participant.opportunity.createdByUserId,
    type: 'opportunity.stageChanged',
    titleKey: 'notifications.stageChanged',
    entityType: 'opportunity',
    entityId: opportunityId,
    payload: { stage: target, respondedBy: actor.userId },
  });

  return updated;
}
