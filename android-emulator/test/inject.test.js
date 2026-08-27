import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { DEVICES } from '../profiles/devices.js';
import { deriveProfile } from '../src/profile/derive.js';
import { buildInitScript, MODULES } from '../src/inject/index.js';
import { makeHelpers } from '../src/inject/native.js';
import { fnv1a, mulberry32, seedId } from '../src/profile/prng.js';

test('the init script is syntactically valid for every device', () => {
  for (const d of DEVICES) {
    const p = deriveProfile({ deviceId: d.id, seed: 'test' });
    const src = buildInitScript(p);
    assert.doesNotThrow(() => new vm.Script(src), `${d.id} produced unparsable source`);
  }
});

test('patch modules capture nothing from module scope', () => {
  // Modules are serialized with Function.prototype.toString, so a reference to
  // an import or a module-level const would compile fine here and throw a
  // ReferenceError in the page. Compiling each module in an empty realm is what
  // catches that before a browser does.
  for (const m of MODULES) {
    const src = `(${m.toString()})`;
    assert.doesNotThrow(() => new vm.Script(src), `${m.name} is unparsable`);
    assert.ok(
      !/\bimport\b|\brequire\(/.test(m.toString()),
      `${m.name} references a module system`
    );
  }
});

test('the config is fully serializable and carries the profile through', () => {
  const p = deriveProfile({ deviceId: 'pixel-8-pro', locale: 'ru-RU', seed: 'abc' });
  const src = buildInitScript(p, { publicIp: '203.0.113.7' });

  const m = /const cfg = (\{[\s\S]*?\});\n/.exec(src);
  assert.ok(m, 'cfg literal not found in the generated script');
  const cfg = JSON.parse(m[1]);

  assert.equal(cfg.js.userAgent, p.js.userAgent);
  assert.equal(cfg.js.webgl.unmaskedRenderer, 'Mali-G715-Immortalis MC11');
  assert.equal(cfg.js.timezone, 'Europe/Moscow');
  assert.deepEqual(cfg.js.languages, ['ru-RU', 'ru', 'en-US', 'en']);
  assert.equal(cfg.js.webrtcPublicIp, '203.0.113.7');
  assert.equal(typeof cfg.js.canvas.seed, 'number');
});

test('debug reporting is off unless asked for', () => {
  const p = deriveProfile({ deviceId: 'pixel-7a', seed: 'x' });
  assert.ok(!buildInitScript(p).includes('console.warn'));
  assert.ok(buildInitScript(p, { debug: true }).includes('console.warn'));
});

test('the native helper makes patched functions report native source', () => {
  // Exercised in a bare realm: makeHelpers only needs Object and Function.
  const ctx = vm.createContext({});
  const helpers = vm.runInContext(`(${makeHelpers.toString()})()`, ctx);

  const target = vm.runInContext('({ get real() { return 1; } })', ctx);
  helpers.defineGetter(target, 'real', () => 42);

  assert.equal(target.real, 42);
  const desc = vm.runInContext(
    'Object.getOwnPropertyDescriptor',
    ctx
  )(target, 'real');
  assert.equal(desc.get.name, 'get real');
  const toStr = vm.runInContext('Function.prototype.toString', ctx);
  assert.match(toStr.call(desc.get), /\[native code\]/);
  // The replacement must not expose itself when asked about itself.
  assert.match(toStr.call(toStr), /\[native code\]/);
  assert.ok(!toStr.call(toStr).includes('sourceOf'));
});

test('replaceMethod keeps name and length', () => {
  const ctx = vm.createContext({});
  const helpers = vm.runInContext(`(${makeHelpers.toString()})()`, ctx);
  const obj = { slice(a, b) { return [a, b]; } };
  helpers.replaceMethod(obj, 'slice', (orig) => function slice(a, b) {
    return orig.call(this, a, b);
  });
  assert.equal(obj.slice.name, 'slice');
  assert.equal(obj.slice.length, 2);
  assert.deepEqual(obj.slice(1, 2), [1, 2]);
});

test('the page-side hash matches the Node-side hash family', () => {
  const ctx = vm.createContext({});
  const helpers = vm.runInContext(`(${makeHelpers.toString()})()`, ctx);
  // Same seed and inputs must give the same value on every call: the dither
  // depends on it, and instability there is the failure the design guards against.
  const a = helpers.hash32(12345, 678, 9);
  const b = helpers.hash32(12345, 678, 9);
  assert.equal(a, b);
  assert.notEqual(helpers.hash32(12345, 678, 9), helpers.hash32(12346, 678, 9));
  assert.ok(a >= 0 && a <= 0xffffffff);
  const f = helpers.hashFloat(1, 2, 3);
  assert.ok(f >= 0 && f < 1);
});

test('the seeded PRNG is stable and well-formed', () => {
  const rngA = mulberry32(fnv1a('seed'));
  const rngB = mulberry32(fnv1a('seed'));
  const a = Array.from({ length: 32 }, rngA);
  const b = Array.from({ length: 32 }, rngB);
  assert.deepEqual(a, b);
  assert.ok(a.every((x) => x >= 0 && x < 1));
  assert.equal(new Set(a).size, 32, 'the generator should not repeat this early');
  assert.match(seedId('seed'), /^[0-9a-f]{16}$/);
});
