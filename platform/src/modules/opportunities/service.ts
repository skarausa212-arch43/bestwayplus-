import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { recordActivity } from '@/modules/activity/service';
import { notify } from '@/modules/notifications/service';
import { CLIENT_PARTICIPANT_SELECT } from './select';
import type { Stage, OpportunityStatus, OpportunityVisibility, TransferType, Foot } from '@prisma/client';

type Ctx = { ip?: string | null; userAgent?: string | null };

const STAFF_OPPORTUNITY_SELECT = {
  id: true, name: true, clubName: true, country: true, league: true, position: true,
  ageMin: true, ageMax: true, preferredFoot: true, salaryMin: true, salaryMax: true,
  salaryCurrency: true, transferType: true, contractLengthMonths: true, deadline: true,
  description: true, internalNotes: true, visibility: true, status: true,
  createdByUserId: true, createdBy: { select: { email: true } }, createdAt: true, updatedAt: true,
  _count: { select: { participants: true } },
} as const;

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

/**
 * Creating an opportunity has no existing owner to authorize against — the
 * self-referential pair here only gates "is this actor's role allowed to
 * create at all" (same trick listAgents/listPlayers use above their own
 * where-clause scoping). Which of a manager's own clients actually get
 * attached is the real, per-target check in addParticipant below.
 */
export async function create(
  actor: Actor,
  data: {
    name: string;
    clubName?: string | null;
    country?: string | null;
    league?: string | null;
    position?: string | null;
    ageMin?: number | null;
    ageMax?: number | null;
    preferredFoot?: Foot | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
    transferType?: TransferType | null;
    contractLengthMonths?: number | null;
    deadline?: Date | null;
    description?: string | null;
    internalNotes?: string | null;
    visibility?: OpportunityVisibility;
    status?: OpportunityStatus;
  },
  ctx: Ctx = {},
) {
  authorize(actor, 'opportunity:create', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });

  const created = await prisma.opportunity.create({
    data: { ...data, createdByUserId: actor.userId },
    select: { id: true },
  });

  await recordActivity({
    actorUserId: actor.userId, action: 'opportunity.created',
    entityType: 'opportunity', entityId: created.id, ctx,
  });

  return created;
}

export async function listForStaff(actor: Actor, filters: { status?: OpportunityStatus; query?: string } = {}) {
  authorize(actor, 'opportunity:readInternal', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });

  return prisma.opportunity.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.query
        ? {
            OR: [
              { name: { contains: filters.query, mode: 'insensitive' } },
              { clubName: { contains: filters.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: STAFF_OPPORTUNITY_SELECT,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 100,
  });
}

export async function getForStaff(actor: Actor, opportunityId: string) {
  authorize(actor, 'opportunity:readInternal', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });

  return prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: {
      ...STAFF_OPPORTUNITY_SELECT,
      participants: {
        select: {
          id: true, stage: true, submittedAt: true, lastStageChangeAt: true, internalNotes: true,
          user: { select: { id: true, email: true, role: true } },
        },
        orderBy: { lastStageChangeAt: 'desc' },
      },
    },
  });
}

/**
 * Candidates are found by email rather than picked from a list — there is no
 * cross-role search endpoint to build a picker from yet, and typing an email
 * you already have (from the players/agents list you came from) is no
 * slower than one more round trip would be.
 */
export async function addParticipant(
  actor: Actor,
  opportunityId: string,
  candidateEmail: string,
  ctx: Ctx = {},
) {
  const candidate = await prisma.user.findUnique({
    where: { email: candidateEmail },
    select: { id: true, role: true, responsibleManagerId: true },
  });
  if (!candidate) {
    const error = new Error('Unknown user') as Error & { code: string; messageKey: string };
    error.code = 'NOT_FOUND';
    error.messageKey = 'opportunities.candidateNotFound';
    throw error;
  }
  if (candidate.role !== 'PLAYER' && candidate.role !== 'AGENT') {
    const error = new Error('Only players and agents can be added') as Error & { code: string; messageKey: string };
    error.code = 'INVALID_ROLE';
    error.messageKey = 'opportunities.invalidCandidate';
    throw error;
  }

  // The real, per-target authorisation: a manager may only add their own
  // assigned clients, whoever created the opportunity itself.
  authorize(actor, 'opportunity:create', {
    ownerUserId: candidate.id,
    responsibleManagerId: candidate.responsibleManagerId,
  });

  let participant: { id: string; stage: Stage };
  try {
    participant = await prisma.opportunityParticipant.create({
      data: { opportunityId, userId: candidate.id, addedByUserId: actor.userId },
      select: { id: true, stage: true },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      const dup = new Error('Already a participant') as Error & { code: string; messageKey: string };
      dup.code = 'ALREADY_PARTICIPANT';
      dup.messageKey = 'opportunities.alreadyParticipant';
      throw dup;
    }
    throw error;
  }

  await notify({
    userId: candidate.id,
    type: 'opportunity.participantAdded',
    titleKey: 'newOpportunity',
    entityType: 'opportunity',
    entityId: opportunityId,
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: candidate.id, action: 'opportunity.participantAdded',
    entityType: 'opportunity', entityId: opportunityId, ctx,
  });

  return participant;
}

/**
 * The staff counterpart to respond() above: not limited to CLIENT_TRANSITIONS
 * because staff are the ones running the pipeline, not just reacting to it.
 */
export async function advanceStaff(actor: Actor, participantId: string, stage: Stage, ctx: Ctx = {}) {
  const participant = await prisma.opportunityParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true, opportunityId: true, stage: true, userId: true,
      user: { select: { responsibleManagerId: true } },
    },
  });
  if (!participant) throw new Error('Unknown participant');

  authorize(actor, 'opportunity:advanceStaff', {
    ownerUserId: participant.userId,
    responsibleManagerId: participant.user.responsibleManagerId,
  });

  const updated = await prisma.opportunityParticipant.update({
    where: { id: participantId },
    data: { stage, lastStageChangeAt: new Date() },
    select: { id: true, stage: true },
  });

  await notify({
    userId: participant.userId,
    type: 'opportunity.stageChanged',
    titleKey: 'stageChanged',
    entityType: 'opportunity',
    entityId: participant.opportunityId,
    payload: { stage },
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: participant.userId, action: 'opportunity.stageChangedByStaff',
    entityType: 'opportunity', entityId: participant.opportunityId,
    metadata: { from: participant.stage, to: stage }, ctx,
  });

  return updated;
}
