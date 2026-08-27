import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEVICES } from '../profiles/devices.js';
import { deriveProfile } from '../src/profile/derive.js';
import { writeNetworkProfile } from '../src/net/profile.js';
import { fingerprint, ensureBinary } from '../src/net/tlsproxy.js';

/**
 * Crosses the Node/Go boundary: the profile the JS side derives must be
 * readable by the proxy and must produce a Chrome-shaped handshake. The Go
 * tests cover the handshake itself; this covers the contract between the two.
 */

let available = false;
let dir;

before(async () => {
  try {
    await ensureBinary();
    available = true;
  } catch {
    // Go missing: the JS half is still testable, so skip rather than fail.
    available = false;
  }
  dir = await mkdtemp(join(tmpdir(), 'andro-tls-'));
});

test('every device produces a Chrome-shaped JA4', async (t) => {
  if (!available) return t.skip('Go toolchain unavailable');

  for (const d of DEVICES) {
    const profile = deriveProfile({ deviceId: d.id, seed: 'tls-test' });
    const path = join(dir, `${d.id}.json`);
    await writeNetworkProfile(profile, path);
    const fp = await fingerprint(path, { host: 'www.example.com' });

    assert.match(
      fp.ja4,
      /^t13d1516h2_[0-9a-f]{12}_[0-9a-f]{12}$/,
      `${d.id}: JA4 ${fp.ja4} is not the shape a modern Chrome hello has`
    );
    assert.match(fp.ja3, /^[0-9a-f]{32}$/, `${d.id}: JA3 is not an md5 hash`);
    assert.equal(fp.device, d.id);
    assert.equal(fp.template.split(' ')[0], profile.net.tls.utls);
  }

  await rm(dir, { recursive: true, force: true });
});

test('the JA4 cipher hash is shared across Chrome milestones', async (t) => {
  if (!available) return t.skip('Go toolchain unavailable');

  const seen = new Map();
  for (const major of [120, 131, 133]) {
    const device = DEVICES.find((d) => d.browser.major === major);
    if (!device) continue;
    const profile = deriveProfile({ deviceId: device.id, seed: 's' });
    const path = join(dir, `ja4-${major}.json`);
    await writeNetworkProfile(profile, path);
    const fp = await fingerprint(path);
    seen.set(major, fp.ja4.split('_'));
  }

  // Chrome's cipher list has not moved across these milestones, so JA4_b is
  // shared. JA4_c differs where the extension or sigalg set changed — that is
  // the field that should distinguish the versions, and if it stops doing so
  // the templates have collapsed onto one another.
  const ciphers = new Set([...seen.values()].map((p) => p[1]));
  assert.equal(ciphers.size, 1, 'Chrome cipher suites should be identical here');
  assert.ok(seen.size >= 2, 'need at least two milestones to compare');
});
