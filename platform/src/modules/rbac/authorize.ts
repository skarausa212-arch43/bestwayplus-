import { grantFor, isStaff, type Action, type Role } from './permissions';

export class AuthorizationError extends Error {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
  constructor(public readonly action: Action) {
    super(`Not permitted: ${action}`);
    this.name = 'AuthorizationError';
  }
}

export class AuthenticationError extends Error {
  readonly status = 401;
  readonly code = 'UNAUTHENTICATED';
  constructor() {
    super('Authentication required');
    this.name = 'AuthenticationError';
  }
}

export interface Actor {
  userId: string;
  role: Role;
  /** Clients assigned to this staff member. Empty for client roles. */
  managedUserIds?: readonly string[];
}

export interface ResourceRef {
  /** Owner of the record being touched. */
  ownerUserId?: string;
  /** Manager responsible for the owner, when known. */
  responsibleManagerId?: string | null;
}

/**
 * The only authorisation entry point. Throws rather than returning false, so
 * a forgotten `if` fails closed instead of silently allowing the call.
 *
 * Never call this from a client component. It is imported by services and by
 * route handlers; the UI uses `can()` below, which is advisory only.
 */
export function authorize(actor: Actor | null, action: Action, resource: ResourceRef = {}): void {
  if (!actor) throw new AuthenticationError();

  const grant = grantFor(actor.role, action);

  switch (grant) {
    case 'allow':
      return;

    case 'own': {
      if (!resource.ownerUserId) throw new AuthorizationError(action);
      if (resource.ownerUserId !== actor.userId) throw new AuthorizationError(action);
      return;
    }

    case 'assigned': {
      if (!isStaff(actor.role)) throw new AuthorizationError(action);
      // A manager reaches a record when they are the responsible manager for
      // its owner. Ownership by another manager is an escalation, not a read.
      const owner = resource.ownerUserId;
      if (!owner) throw new AuthorizationError(action);
      const assigned =
        resource.responsibleManagerId === actor.userId ||
        (actor.managedUserIds?.includes(owner) ?? false);
      if (!assigned) throw new AuthorizationError(action);
      return;
    }

    case 'deny':
    default:
      throw new AuthorizationError(action);
  }
}

/** Advisory check for rendering decisions. Never a substitute for authorize(). */
export function can(actor: Actor | null, action: Action, resource: ResourceRef = {}): boolean {
  try {
    authorize(actor, action, resource);
    return true;
  } catch {
    return false;
  }
}
