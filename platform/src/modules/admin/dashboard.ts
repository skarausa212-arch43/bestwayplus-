import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';

/**
 * Counters for the operational dashboard. Each one is a link to a filtered
 * queue rather than a decorative tile, so the query mirrors what the click
 * will show.
 */
export async function dashboardCounters(actor: Actor) {
  authorize(actor, 'profile:readAny', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });

  const mine = actor.role === 'MANAGER' ? { responsibleManagerId: actor.userId } : {};
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const [
    newPlayers, newAgents, newClubs, newInvestors, newScouts,
    pendingVerification, documentsToReview, activeOpportunities, openTasks, unreadMessages,
  ] = await Promise.all([
      prisma.user.count({ where: { ...mine, role: 'PLAYER', createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { ...mine, role: 'AGENT', createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { ...mine, role: 'CLUB', createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { ...mine, role: 'INVESTOR', createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { ...mine, role: 'SCOUT', createdAt: { gte: sevenDaysAgo } } }),
      prisma.agentProfile.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.document.count({
        where: {
          deletedAt: null,
          status: { in: ['UPLOADED', 'UNDER_REVIEW'] },
          ...(actor.role === 'MANAGER' ? { owner: { responsibleManagerId: actor.userId } } : {}),
        },
      }),
      prisma.opportunity.count({ where: { status: 'OPEN' } }),
      prisma.taskItem.count({ where: { assigneeUserId: actor.userId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.message.count({
        where: {
          conversation: { participants: { some: { userId: actor.userId } } },
          senderUserId: { not: actor.userId },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
    ]);

  return {
    newPlayers, newAgents, newClubs, newInvestors, newScouts,
    pendingVerification, documentsToReview, activeOpportunities, openTasks, unreadMessages,
  };
}
