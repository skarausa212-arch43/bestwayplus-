/**
 * LUMI admin capability model (18_ADMIN_PANEL.md §2/§20).
 *
 * Admin access is *capability-based and fully audited*, not a single "admin"
 * flag. A staff user carries an `adminRole`; each role grants a set of
 * capabilities. Endpoints ask `can(user, 'bookings.manage')` rather than
 * checking a role name, so responsibilities stay least-privilege and the
 * high-risk ones (impersonation, payouts) never leak to lower tiers (§20).
 */
'use strict';

// Every capability the panel gates on.
const CAPS = [
  'dashboard.view', 'users.view', 'users.suspend', 'users.impersonate',
  'kyc.review', 'bookings.view', 'bookings.manage', 'payments.view',
  'payouts.manage', 'pricing.manage', 'disputes.manage', 'notifications.broadcast',
  'analytics.view', 'fraud.view', 'ai.monitor', 'audit.view',
];

// §2 access roles → capabilities. Super admin implicitly gets everything.
const ROLE_CAPS = {
  support: ['dashboard.view', 'users.view', 'bookings.view', 'disputes.manage'],
  operations: ['dashboard.view', 'users.view', 'bookings.view', 'bookings.manage', 'analytics.view', 'fraud.view'],
  finance: ['dashboard.view', 'payments.view', 'payouts.manage', 'analytics.view'],
  kyc: ['dashboard.view', 'users.view', 'kyc.review'],
  marketing: ['dashboard.view', 'notifications.broadcast', 'analytics.view'],
  admin: ['dashboard.view', 'users.view', 'users.suspend', 'kyc.review', 'bookings.view',
    'bookings.manage', 'payments.view', 'payouts.manage', 'disputes.manage',
    'notifications.broadcast', 'analytics.view', 'fraud.view', 'ai.monitor', 'audit.view'],
  super: CAPS.slice(),   // everything, incl. impersonation
};

function capsFor(adminRole) {
  return ROLE_CAPS[adminRole] || [];
}

// Does this user hold the capability? Only platform staff (role 'admin') can;
// their tier is `adminRole` (defaults to 'super' for the legacy single admin).
function can(user, cap) {
  if (!user || user.role !== 'admin') return false;
  const tier = user.adminRole || 'super';
  if (tier === 'super') return true;
  return capsFor(tier).includes(cap);
}

module.exports = { CAPS, ROLE_CAPS, capsFor, can };
