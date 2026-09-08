import { describe, expect, it } from 'vitest';
import { authorize, can, AuthorizationError, AuthenticationError, type Actor } from '../authorize';
import { ACTIONS, CLIENT_ROLES, MATRIX, grantFor, type Role } from '../permissions';

const actor = (role: Role, userId = 'actor-1', managedUserIds: string[] = []): Actor => ({
  role, userId, managedUserIds,
});

describe('permission matrix', () => {
  it('denies by default — every action a role is not listed for', () => {
    for (const action of ACTIONS) {
      const listed = Object.keys(MATRIX[action]) as Role[];
      const unlisted = (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'PLAYER', 'AGENT', 'CLUB', 'INVESTOR', 'SCOUT'] as Role[])
        .filter((r) => !listed.includes(r));
      for (const role of unlisted) {
        expect(grantFor(role, action)).toBe('deny');
      }
    }
  });

  it('refuses an unauthenticated caller for every action', () => {
    for (const action of ACTIONS) {
      expect(() => authorize(null, action)).toThrow(AuthenticationError);
    }
  });
});

describe('internal-only data', () => {
  const INTERNAL = ['assessment:read', 'assessment:write', 'note:read', 'note:write',
    'opportunity:readInternal', 'activity:readAny', 'audit:read'] as const;

  it('is unreachable by every client role', () => {
    for (const action of INTERNAL) {
      for (const role of CLIENT_ROLES) {
        expect(can(actor(role), action, { ownerUserId: 'actor-1' })).toBe(false);
      }
    }
  });
});

describe('ownership', () => {
  it('lets a player reach only their own records', () => {
    const player = actor('PLAYER', 'player-1');
    expect(can(player, 'document:readOwn', { ownerUserId: 'player-1' })).toBe(true);
    expect(can(player, 'document:readOwn', { ownerUserId: 'player-2' })).toBe(false);
  });

  it('rejects an own-scoped action when no owner is supplied', () => {
    expect(() => authorize(actor('PLAYER', 'player-1'), 'document:readOwn', {}))
      .toThrow(AuthorizationError);
  });
});

describe('manager assignment', () => {
  it('reaches an assigned client and not an unassigned one', () => {
    const manager = actor('MANAGER', 'mgr-1', ['player-1']);
    expect(can(manager, 'profile:readAny', { ownerUserId: 'player-1' })).toBe(true);
    expect(can(manager, 'profile:readAny', { ownerUserId: 'player-9' })).toBe(false);
  });

  it('also accepts the responsibleManagerId path', () => {
    const manager = actor('MANAGER', 'mgr-1');
    expect(can(manager, 'profile:readAny', { ownerUserId: 'p', responsibleManagerId: 'mgr-1' })).toBe(true);
    expect(can(manager, 'profile:readAny', { ownerUserId: 'p', responsibleManagerId: 'mgr-2' })).toBe(false);
  });

  it('never grants a manager the SUPER_ADMIN-only actions', () => {
    const manager = actor('MANAGER', 'mgr-1', ['player-1']);
    expect(can(manager, 'staff:manage', { ownerUserId: 'player-1' })).toBe(false);
    expect(can(manager, 'audit:read', { ownerUserId: 'player-1' })).toBe(false);
    expect(can(manager, 'verification:decide', { ownerUserId: 'player-1' })).toBe(false);
  });
});

describe('verification', () => {
  it('cannot be self-granted by an agent', () => {
    expect(can(actor('AGENT', 'agent-1'), 'verification:decide', { ownerUserId: 'agent-1' })).toBe(false);
  });
});
