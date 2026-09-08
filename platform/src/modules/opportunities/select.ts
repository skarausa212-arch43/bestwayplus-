import type { Prisma } from '@prisma/client';

/**
 * The client-safe projection.
 *
 * Internal notes are excluded here, at the query, rather than filtered in a
 * component. That is the whole point: a future component that forgets to omit
 * a field cannot leak one, because the field never left the database.
 *
 * `CLIENT_OPPORTUNITY_SELECT` is exported as a const object so a test can
 * assert on its keys — see __tests__/visibility.test.ts.
 */
export const CLIENT_OPPORTUNITY_SELECT = {
  id: true,
  name: true,
  clubName: true,
  country: true,
  league: true,
  position: true,
  ageMin: true,
  ageMax: true,
  preferredFoot: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  transferType: true,
  contractLengthMonths: true,
  deadline: true,
  description: true,
  status: true,
  createdAt: true,
} as const satisfies Prisma.OpportunitySelect;

export const CLIENT_PARTICIPANT_SELECT = {
  id: true,
  stage: true,
  submittedAt: true,
  lastStageChangeAt: true,
  createdAt: true,
  opportunity: { select: CLIENT_OPPORTUNITY_SELECT },
} as const satisfies Prisma.OpportunityParticipantSelect;

/** Fields that must never appear in a client-facing projection. */
export const INTERNAL_OPPORTUNITY_FIELDS = ['internalNotes', 'createdByUserId', 'visibility'] as const;
export const INTERNAL_PARTICIPANT_FIELDS = ['internalNotes', 'addedByUserId'] as const;
