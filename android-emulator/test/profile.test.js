import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEVICES, getDevice } from '../profiles/devices.js';
import { LOCALES, HEADER_ORDER, resolveTlsProfile } from '../profiles/network.js';
import { deriveProfile } from '../src/profile/derive.js';
import { buildNetworkProfile } from '../src/net/profile.js';

test('every device panel matches its CSS size times DPR', () => {
  for (const d of DEVICES) {
    const w = Math.round(d.screen.width * d.screen.dpr);
    const h = Math.round(d.screen.height * d.screen.dpr);
    assert.ok(
      Math.abs(w - d.panel.w) <= 2,
      `${d.id}: ${d.screen.width} x ${d.screen.dpr} = ${w}, panel says ${d.panel.w}`
    );
    assert.ok(
      Math.abs(h - d.panel.h) <= 2,
      `${d.id}: ${d.screen.height} x ${d.screen.dpr} = ${h}, panel says ${d.panel.h}`
    );
  }
});

test('every device has a uTLS template for its Chrome version', () => {
  for (const d of DEVICES) {
    assert.doesNotThrow(
      () => resolveTlsProfile(d.browser.major),
      `${d.id} claims Chrome ${d.browser.major} with no matching handshake`
    );
  }
});

test('every device derives without throwing, in every locale', () => {
  for (const d of DEVICES) {
    for (const locale of Object.keys(LOCALES)) {
      const p = deriveProfile({ deviceId: d.id, locale, seed: 'test' });
      assert.equal(p.deviceId, d.id);
      assert.equal(p.js.language, LOCALES[locale].languages[0]);
    }
  }
});

test('derivation is deterministic for a given seed and divergent across seeds', () => {
  const a = deriveProfile({ deviceId: 'pixel-8-pro', seed: 'seed-one' });
  const b = deriveProfile({ deviceId: 'pixel-8-pro', seed: 'seed-one' });
  const c = deriveProfile({ deviceId: 'pixel-8-pro', seed: 'seed-two' });

  assert.deepEqual(a, b, 'same seed must reproduce the same identity exactly');
  assert.notEqual(
    a.js.canvas.seed,
    c.js.canvas.seed,
    'different seeds must not share a canvas dither'
  );
  assert.notEqual(a.seedId, c.seedId);
});

test('the Android UA is the reduced form, not the real model', () => {
  for (const d of DEVICES) {
    const p = deriveProfile({ deviceId: d.id, seed: 'test' });
    assert.match(
      p.js.userAgent,
      /Linux; Android 10; K\)/,
      `${d.id}: Chrome 110+ freezes the Android UA; the model belongs in client hints only`
    );
    assert.ok(
      !p.js.userAgent.includes(d.model),
      `${d.id}: the real model must not appear in the UA string`
    );
    assert.equal(p.js.uaData.model, d.model, 'the model must appear in high-entropy hints');
  }
});

test('tablets omit the Mobile UA token, phones keep it', () => {
  for (const d of DEVICES) {
    const p = deriveProfile({ deviceId: d.id, seed: 'test' });
    const hasMobile = / Mobile Safari/.test(p.js.userAgent);
    assert.equal(
      hasMobile,
      d.formFactor === 'mobile',
      `${d.id} (${d.formFactor}) has the wrong Mobile token`
    );
    assert.equal(p.net.clientHints['sec-ch-ua-mobile'], d.formFactor === 'mobile' ? '?1' : '?0');
  }
});

test('deviceMemory is one of the values Chrome can report', () => {
  const allowed = new Set([0.25, 0.5, 1, 2, 4, 8]);
  for (const d of DEVICES) {
    const p = deriveProfile({ deviceId: d.id, seed: 'test' });
    assert.ok(allowed.has(p.js.deviceMemory), `${d.id}: ${p.js.deviceMemory}`);
  }
});

test('Network Information values stay on Chrome\'s quantization grid', () => {
  for (const seed of ['a', 'b', 'c', 'd', 'e']) {
    const p = deriveProfile({ deviceId: 'xiaomi-13', seed });
    assert.equal(p.js.connection.rtt % 25, 0, `rtt ${p.js.connection.rtt} is off-grid`);
    assert.ok(p.js.connection.downlink <= 10);
    assert.equal(Math.round(p.js.connection.downlink * 40) % 10, 0);
  }
});

test('header orders are free of duplicates and lower-case', () => {
  for (const [name, list] of Object.entries(HEADER_ORDER)) {
    const seen = new Set();
    for (const h of list) {
      assert.equal(h, h.toLowerCase(), `${name}: "${h}" must be lower-case`);
      assert.ok(!seen.has(h), `${name}: "${h}" listed twice`);
      seen.add(h);
    }
  }
  assert.deepEqual(
    HEADER_ORDER.h2Pseudo,
    [':method', ':authority', ':scheme', ':path'],
    "Chrome's pseudo-header order is m,a,s,p"
  );
});

test('the network profile carries everything the proxy needs', () => {
  const p = deriveProfile({ deviceId: 'galaxy-tab-s9', locale: 'de-DE', seed: 'x' });
  const net = buildNetworkProfile(p, { upstream: 'socks5://127.0.0.1:1080' });

  assert.equal(net.userAgent, p.js.userAgent);
  assert.equal(net.acceptLanguage, 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7');
  assert.equal(net.tls.utls, 'HelloChrome_131');
  assert.equal(net.upstream, 'socks5://127.0.0.1:1080');
  assert.deepEqual(net.headerOrder.h2Pseudo, [':method', ':authority', ':scheme', ':path']);
  assert.equal(net.http2.connectionFlow, 15663105);
  assert.equal(net.clientHints['sec-ch-ua-platform'], '"Android"');
  assert.equal(net.clientHints['sec-ch-ua-model'], '"SM-X710"');
});

test('locale, timezone and accept-language stay one identity', () => {
  for (const [tag, l] of Object.entries(LOCALES)) {
    const p = deriveProfile({ deviceId: 'pixel-7a', locale: tag, seed: 's' });
    assert.equal(p.js.timezone, l.timezone);
    assert.equal(p.net.timezone, l.timezone);
    assert.ok(
      p.net.acceptLanguage.startsWith(l.languages[0]),
      `${tag}: accept-language must lead with navigator.languages[0]`
    );
    assert.equal(p.net.expectedCountry, l.country);
  }
});

test('an unknown device or locale fails loudly', () => {
  assert.throws(() => deriveProfile({ deviceId: 'nokia-3310' }), /Unknown device/);
  assert.throws(() => deriveProfile({ deviceId: 'pixel-7a', locale: 'xx-XX' }), /Unknown locale/);
  assert.throws(() => deriveProfile({}), /deviceId is required/);
  assert.throws(() => resolveTlsProfile(999), /No uTLS ClientHello template/);
});

test('GPU limits are internally consistent', () => {
  for (const d of DEVICES) {
    const L = getDevice(d.id).gpu.limits;
    assert.deepEqual(
      L.MAX_VIEWPORT_DIMS,
      [L.MAX_TEXTURE_SIZE, L.MAX_TEXTURE_SIZE],
      `${d.id}: viewport dims and texture size disagree`
    );
    assert.ok(L.MAX_RENDERBUFFER_SIZE === L.MAX_TEXTURE_SIZE, `${d.id}`);
  }
});
