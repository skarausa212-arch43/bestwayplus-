/**
 * Self-checks for the admin capability model (18_ADMIN_PANEL.md §21).
 *   node admin/test.js
 */
'use strict';
const assert = require('assert');
const rbac = require('./rbac');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };

ok('non-admin users never hold capabilities', () => {
  assert.strictEqual(rbac.can({ role: 'customer' }, 'users.view'), false);
  assert.strictEqual(rbac.can({ role: 'cleaner' }, 'bookings.manage'), false);
  assert.strictEqual(rbac.can(null, 'audit.view'), false);
});

ok('super admin holds every capability (incl. impersonation)', () => {
  const su = { role: 'admin', adminRole: 'super' };
  for (const c of rbac.CAPS) assert.strictEqual(rbac.can(su, c), true, 'missing ' + c);
  assert.strictEqual(rbac.can(su, 'users.impersonate'), true);
});

ok('legacy admin with no adminRole defaults to super', () => {
  assert.strictEqual(rbac.can({ role: 'admin' }, 'pricing.manage'), true);
});

ok('least privilege: support cannot suspend, redispatch or see payments', () => {
  const s = { role: 'admin', adminRole: 'support' };
  assert.strictEqual(rbac.can(s, 'disputes.manage'), true);
  assert.strictEqual(rbac.can(s, 'users.suspend'), false);
  assert.strictEqual(rbac.can(s, 'bookings.manage'), false);
  assert.strictEqual(rbac.can(s, 'payments.view'), false);
});

ok('finance sees payments/payouts but not user suspension or KYC', () => {
  const f = { role: 'admin', adminRole: 'finance' };
  assert.strictEqual(rbac.can(f, 'payouts.manage'), true);
  assert.strictEqual(rbac.can(f, 'users.suspend'), false);
  assert.strictEqual(rbac.can(f, 'kyc.review'), false);
});

ok('impersonation is super-only (not even full admin tier)', () => {
  assert.strictEqual(rbac.can({ role: 'admin', adminRole: 'admin' }, 'users.impersonate'), false);
  assert.strictEqual(rbac.can({ role: 'admin', adminRole: 'super' }, 'users.impersonate'), true);
});

console.log(`\n${n} admin rbac checks passed.`);
