import { describe, expect, it } from 'vitest';
import { can, type Actor } from '@/modules/rbac/authorize';
import { CLIENT_ROLES, type Role } from '@/modules/rbac/permissions';
import { ASSESSMENT_FIELDS, PLAYER_ROW_FIELDS } from '../player-select';

const actor = (role: Role, userId = 'staff-1', managedUserIds: string[] = []): Actor => ({
  role, userId, managedUserIds,
});

/**
 * These assertions guard the two mistakes that would actually hurt: an
 * internal field riding along in a list payload, and a credential or an
 * outbound link being issued by someone who should not be able to.
 */
describe('internal assessment isolation', () => {
  it('is absent from the staff list projection', () => {
    for (const field of ASSESSMENT_FIELDS) {
      expect(PLAYER_ROW_FIELDS).not.toContain(field);
    }
  });

  it('is unreachable by every client role', () => {
    for (const role of CLIENT_ROLES) {
      expect(can(actor(role, 'u1'), 'assessment:read', { ownerUserId: 'u1' })).toBe(false);
      expect(can(actor(role, 'u1'), 'assessment:write', { ownerUserId: 'u1' })).toBe(false);
    }
  });

  it('is reachable by a manager only for an assigned client', () => {
    const manager = actor('MANAGER', 'mgr-1', ['player-1']);
    expect(can(manager, 'assessment:read', { ownerUserId: 'player-1' })).toBe(true);
    expect(can(manager, 'assessment:read', { ownerUserId: 'player-2' })).toBe(false);
  });
});

describe('licence verification', () => {
  it('is an ADMIN decision — a manager cannot grant it', () => {
    expect(can(actor('MANAGER', 'mgr-1', ['agent-1']), 'verification:decide', { ownerUserId: 'agent-1' })).toBe(false);
    expect(can(actor('ADMIN'), 'verification:decide', { ownerUserId: 'agent-1' })).toBe(true);
    expect(can(actor('SUPER_ADMIN'), 'verification:decide', { ownerUserId: 'agent-1' })).toBe(true);
  });

  it('cannot be granted by the agent to themselves', () => {
    expect(can(actor('AGENT', 'agent-1'), 'verification:decide', { ownerUserId: 'agent-1' })).toBe(false);
  });
});

describe('share links', () => {
  it('cannot be created by any client role, including the player', () => {
    for (const role of CLIENT_ROLES) {
      expect(can(actor(role, 'u1'), 'shareLink:create', { ownerUserId: 'u1' })).toBe(false);
    }
  });

  it('let a player see that a link exists without being able to issue one', () => {
    const player = actor('PLAYER', 'player-1');
    expect(can(player, 'shareLink:readOwn', { ownerUserId: 'player-1' })).toBe(true);
    expect(can(player, 'shareLink:create', { ownerUserId: 'player-1' })).toBe(false);
  });

  it('restricts a manager to their assigned clients', () => {
    const manager = actor('MANAGER', 'mgr-1', ['player-1']);
    expect(can(manager, 'shareLink:create', { ownerUserId: 'player-1' })).toBe(true);
    expect(can(manager, 'shareLink:create', { ownerUserId: 'player-9' })).toBe(false);
  });
});

describe('audit and staff administration', () => {
  it('are SUPER_ADMIN only', () => {
    for (const role of ['ADMIN', 'MANAGER', ...CLIENT_ROLES] as Role[]) {
      expect(can(actor(role, 'u1'), 'audit:read', { ownerUserId: 'u1' })).toBe(false);
      expect(can(actor(role, 'u1'), 'staff:manage', { ownerUserId: 'u1' })).toBe(false);
    }
    expect(can(actor('SUPER_ADMIN'), 'audit:read')).toBe(true);
    expect(can(actor('SUPER_ADMIN'), 'staff:manage')).toBe(true);
  });
});
