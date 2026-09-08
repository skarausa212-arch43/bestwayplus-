import type { Prisma } from '@prisma/client';

/**
 * The staff-facing player projection, kept apart from the service so it can be
 * asserted on without loading a database client — the same reason
 * `opportunities/select.ts` exists.
 *
 * The internal assessment is not reachable from here at all: it has its own
 * query, its own permission and its own test.
 */
export const PLAYER_ROW_SELECT = {
  id: true,
  userId: true,
  firstName: true, lastName: true, dateOfBirth: true,
  nationality: true, primaryPosition: true, currentClub: true,
  contractUntil: true, completionPercent: true, hasAgent: true,
  updatedAt: true,
  user: {
    select: {
      id: true, email: true, status: true, lastLoginAt: true,
      responsibleManagerId: true,
      responsibleManager: { select: { id: true, email: true } },
      _count: { select: { ownedDocuments: true } },
    },
  },
} as const satisfies Prisma.PlayerProfileSelect;

export const PLAYER_ROW_FIELDS = Object.keys(PLAYER_ROW_SELECT);

/** Internal-only columns. None of these may appear in any staff list payload. */
export const ASSESSMENT_FIELDS = [
  'internalRating', 'potential', 'marketability', 'reliability',
  'priority', 'recommendedMarkets', 'expectedLevel', 'comments',
  'nextAction', 'followUpDate',
] as const;
