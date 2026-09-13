import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { rateLimit } = await import('../src/lib/auth.js');

/** Drives the middleware directly so the limiter is covered without throttling the API suite. */
function run(mw, ip = '1.2.3.4', path = '/login') {
  return new Promise((resolve) => {
    const req = { ip, path };
    const res = { set: () => {} };
    mw(req, res, (err) => resolve(err));
  });
}

test('rate limiter allows up to max, then rejects with 429', async () => {
  const mw = rateLimit({ windowMs: 60_000, max: 2, enabled: true });
  assert.equal(await run(mw), undefined);
  assert.equal(await run(mw), undefined);
  const blocked = await run(mw);
  assert.ok(blocked, 'third request is rejected');
  assert.equal(blocked.status, 429);
});

test('rate limiter counts each client separately', async () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1, enabled: true });
  assert.equal(await run(mw, '10.0.0.1', '/x'), undefined);
  assert.ok(await run(mw, '10.0.0.1', '/x'), 'same IP is limited');
  assert.equal(await run(mw, '10.0.0.2', '/x'), undefined, 'a different IP is unaffected');
});

test('the window expires and the client is allowed again', async () => {
  const mw = rateLimit({ windowMs: 20, max: 1, enabled: true });
  assert.equal(await run(mw, '10.0.0.9', '/y'), undefined);
  assert.ok(await run(mw, '10.0.0.9', '/y'));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(await run(mw, '10.0.0.9', '/y'), undefined);
});

test('the limiter is disabled in the test environment by default', async () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1 });
  assert.equal(await run(mw, '10.0.0.5', '/z'), undefined);
  assert.equal(await run(mw, '10.0.0.5', '/z'), undefined);
});
