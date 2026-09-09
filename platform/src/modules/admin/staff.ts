import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/crypto';
import { authorize, type Actor } from '@/modules/rbac/authorize';
import { STAFF_ROLES, type Role } from '@/modules/rbac/permissions';
import { recordActivity } from '@/modules/activity/service';

type Ctx = { ip?: string | null; userAgent?: string | null };

export async function listStaff(actor: Actor) {
  authorize(actor, 'staff:manage');

  return prisma.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    select: { id: true, email: true, role: true, status: true, createdAt: true, lastLoginAt: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
}

function isStaffRole(role: string): role is (typeof STAFF_ROLES)[number] {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/**
 * No email delivery exists in this codebase to invite someone by link (see
 * EMAIL_API_KEY in .env.example — reserved, never wired to a provider or
 * called anywhere). So a new staff account gets a server-generated password
 * returned once in the response, the same "shown once, copy it now" pattern
 * already used for share links — never logged, never stored anywhere but
 * its hash.
 */
export async function createStaff(
  actor: Actor,
  input: { email: string; role: Role },
  ctx: Ctx = {},
) {
  authorize(actor, 'staff:manage');
  if (!isStaffRole(input.role)) throw new Error('Not a staff role');

  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    const error = new Error('Email already in use') as Error & { code: string; messageKey: string };
    error.code = 'EMAIL_TAKEN';
    error.messageKey = 'validation.emailTaken';
    throw error;
  }

  const password = randomBytes(15).toString('base64url'); // 20 chars, URL-safe
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: input.role,
      // Staff accounts are usable immediately — there is no email-verification
      // flow to complete, and blocking a colleague's first login on a step
      // that can never finish would just be a dead end.
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
    select: { id: true, email: true, role: true },
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: user.id,
    action: 'staff.created', metadata: { role: input.role }, ctx,
  });

  return { ...user, password };
}

async function assertNotLastSuperAdmin(userId: string, action: string) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (target?.role !== 'SUPER_ADMIN') return;

  const otherActiveSuperAdmins = await prisma.user.count({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: userId } },
  });
  if (otherActiveSuperAdmins === 0) {
    const error = new Error(`Cannot ${action} the only active super admin`) as Error & { code: string; messageKey: string };
    error.code = 'LAST_SUPER_ADMIN';
    error.messageKey = 'admin.lastSuperAdmin';
    throw error;
  }
}

export async function setStaffRole(actor: Actor, userId: string, role: Role, ctx: Ctx = {}) {
  authorize(actor, 'staff:manage');
  if (!isStaffRole(role)) throw new Error('Not a staff role');

  await assertNotLastSuperAdmin(userId, 'demote');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, role: true },
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: userId,
    action: 'staff.roleChanged', metadata: { role }, ctx,
  });

  return updated;
}

export async function setStaffStatus(
  actor: Actor,
  userId: string,
  status: 'ACTIVE' | 'SUSPENDED',
  ctx: Ctx = {},
) {
  authorize(actor, 'staff:manage');

  if (status === 'SUSPENDED') await assertNotLastSuperAdmin(userId, 'suspend');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status },
    select: { id: true, email: true, status: true },
  });

  await recordActivity({
    actorUserId: actor.userId, subjectUserId: userId,
    action: 'staff.statusChanged', metadata: { status }, ctx,
  });

  return updated;
}
