import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import type { VerificationStatus } from '@prisma/client';

/**
 * No setInvestorVerification here: InvestorProfile has a verificationStatus
 * column but no verifiedAt/verifiedByUserId — nothing to record who decided
 * or when. Every other verification action in this codebase keeps at least
 * that much of an audit trail, so this stays read-only until the schema
 * carries one rather than writing a status change with no accountability.
 */
export async function listInvestors(actor: Actor, filters: { status?: VerificationStatus; query?: string } = {}) {
  authorize(actor, 'profile:readAny', { ownerUserId: actor.userId, responsibleManagerId: actor.userId });

  const scope = actor.role === 'MANAGER' ? { user: { responsibleManagerId: actor.userId } } : {};

  return prisma.investorProfile.findMany({
    where: {
      ...scope,
      ...(filters.status ? { verificationStatus: filters.status } : {}),
      ...(filters.query
        ? {
            OR: [
              { displayName: { contains: filters.query, mode: 'insensitive' } },
              { company: { contains: filters.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true, userId: true, displayName: true, company: true, country: true,
      entityType: true, verificationStatus: true, updatedAt: true,
      user: { select: { email: true, status: true, createdAt: true } },
    },
    orderBy: [{ verificationStatus: 'asc' }, { updatedAt: 'desc' }],
    take: 100,
  });
}

export async function getInvestorForStaff(actor: Actor, investorUserId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: investorUserId },
    select: { id: true, responsibleManagerId: true },
  });
  if (!owner) return null;

  authorize(actor, 'profile:readAny', {
    ownerUserId: owner.id,
    responsibleManagerId: owner.responsibleManagerId,
  });

  return prisma.investorProfile.findUnique({
    where: { userId: investorUserId },
    select: {
      // preferredMarkets and contactInfo exist on the model but nothing in the
      // registration form collects them — omitted here rather than always
      // rendering an empty field.
      id: true, entityType: true, displayName: true, company: true, country: true,
      businessArea: true, investmentInterests: true, footballInterests: true,
      investmentRange: true, professionalBackground: true,
      verificationStatus: true,
      user: { select: { email: true, createdAt: true, responsibleManagerId: true, responsibleManager: { select: { email: true } } } },
    },
  });
}
