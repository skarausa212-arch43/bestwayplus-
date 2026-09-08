/**
 * The permission matrix, as data.
 *
 * This file is the single source of truth referenced by section 06 of the
 * specification. The UI imports it to decide what to render; the services
 * import it to decide what to allow. They cannot drift, because there is only
 * one table.
 */

export const ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'MANAGER',
  'PLAYER', 'AGENT', 'CLUB', 'INVESTOR', 'SCOUT',
] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: readonly Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
export const CLIENT_ROLES: readonly Role[] = ['PLAYER', 'AGENT', 'CLUB', 'INVESTOR', 'SCOUT'];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export const ACTIONS = [
  'profile:readOwn', 'profile:updateOwn', 'profile:readAny',
  'assessment:read', 'assessment:write',
  'note:read', 'note:write',
  'document:createOwn', 'document:readOwn', 'document:deleteOwn',
  'document:readAny', 'document:review', 'document:request',
  'verification:decide',
  'opportunity:create', 'opportunity:readInternal', 'opportunity:readAsParticipant',
  'opportunity:advanceStaff', 'opportunity:respond',
  'recruitment:submit', 'recruitment:manage',
  'shareLink:create', 'shareLink:readOwn',
  'message:withStaff', 'message:readAny',
  'task:manage',
  'activity:readAny', 'activity:readOwn',
  'consent:manageOwn',
  'privacy:requestOwn', 'privacy:execute',
  'staff:manage', 'audit:read', 'translation:edit',
] as const;
export type Action = (typeof ACTIONS)[number];

/** 'allow' unconditionally · 'own' only for records the caller owns ·
 *  'assigned' staff members limited to their assigned clients · 'deny'. */
export type Grant = 'allow' | 'own' | 'assigned' | 'deny';

type Matrix = Record<Action, Partial<Record<Role, Grant>>>;

const A: Grant = 'allow';
const O: Grant = 'own';
const S: Grant = 'assigned';

/** Anything not listed for a role is denied. Default deny is the point. */
export const MATRIX: Matrix = {
  'profile:readOwn':   { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O, AGENT: O, CLUB: O, INVESTOR: O, SCOUT: O },
  'profile:updateOwn': { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O, AGENT: O, CLUB: O, INVESTOR: O, SCOUT: O },
  'profile:readAny':   { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },

  'assessment:read':   { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'assessment:write':  { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'note:read':         { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'note:write':        { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },

  'document:createOwn': { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O, AGENT: O, CLUB: O, INVESTOR: O, SCOUT: O },
  'document:readOwn':   { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O, AGENT: O, CLUB: O, INVESTOR: O, SCOUT: O },
  'document:deleteOwn': { SUPER_ADMIN: A, ADMIN: A, PLAYER: O, AGENT: O, CLUB: O, INVESTOR: O, SCOUT: O },
  'document:readAny':   { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'document:review':    { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'document:request':   { SUPER_ADMIN: A, ADMIN: A, MANAGER: A },

  'verification:decide': { SUPER_ADMIN: A, ADMIN: A },

  'opportunity:create':            { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'opportunity:readInternal':      { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'opportunity:readAsParticipant': { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O, AGENT: O },
  'opportunity:advanceStaff':      { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'opportunity:respond':           { PLAYER: O, AGENT: O },

  'recruitment:submit': { CLUB: O },
  'recruitment:manage': { SUPER_ADMIN: A, ADMIN: A, MANAGER: A },

  'shareLink:create':  { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'shareLink:readOwn': { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O },

  'message:withStaff': { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O, AGENT: O, CLUB: O, INVESTOR: O, SCOUT: O },
  'message:readAny':   { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },

  'task:manage': { SUPER_ADMIN: A, ADMIN: A, MANAGER: A },

  'activity:readAny': { SUPER_ADMIN: A, ADMIN: A, MANAGER: S },
  'activity:readOwn': { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O, AGENT: O, CLUB: O, INVESTOR: O, SCOUT: O },

  'consent:manageOwn':  { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O, AGENT: O, CLUB: O, INVESTOR: O, SCOUT: O },
  'privacy:requestOwn': { SUPER_ADMIN: A, ADMIN: A, MANAGER: A, PLAYER: O, AGENT: O, CLUB: O, INVESTOR: O, SCOUT: O },
  'privacy:execute':    { SUPER_ADMIN: A, ADMIN: S },

  'staff:manage':     { SUPER_ADMIN: A },
  'audit:read':       { SUPER_ADMIN: A },
  'translation:edit': { SUPER_ADMIN: A, ADMIN: A },
};

export function grantFor(role: Role, action: Action): Grant {
  return MATRIX[action][role] ?? 'deny';
}
