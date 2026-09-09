import { prisma } from '@/lib/db';
import { authorize, type Actor } from '@/modules/rbac/authorize';

const AUDIT_SELECT = {
  id: true, action: true, entityType: true, entityId: true, ip: true, createdAt: true,
  actor: { select: { id: true, email: true } },
  subject: { select: { id: true, email: true } },
} as const;

export interface AuditFilters {
  action?: string;
  /** Matches either the actor's or the subject's email, case-insensitively. */
  email?: string;
  cursor?: string;
  take?: number;
}

/** audit:read is SUPER_ADMIN-only in the RBAC matrix — no other staff role reaches this. */
export async function listActivity(actor: Actor, filters: AuditFilters = {}) {
  authorize(actor, 'audit:read');

  const take = Math.min(filters.take ?? 50, 200);
  const emailFilter = filters.email
    ? {
        OR: [
          { actor: { email: { contains: filters.email, mode: 'insensitive' as const } } },
          { subject: { email: { contains: filters.email, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const rows = await prisma.activityLog.findMany({
    where: {
      ...(filters.action ? { action: filters.action } : {}),
      ...emailFilter,
    },
    select: AUDIT_SELECT,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  return { rows: hasMore ? rows.slice(0, take) : rows, nextCursor: hasMore ? rows[take - 1]!.id : null };
}

/** Populates the action filter dropdown from what has actually been logged. */
export async function listActionTypes(actor: Actor): Promise<string[]> {
  authorize(actor, 'audit:read');

  const rows = await prisma.activityLog.findMany({
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
    take: 500,
  });
  return rows.map((row) => row.action);
}
