import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareFonts, fontconfigSupported } from '../src/net/fonts.js';
import { proxyBinaryName } from '../src/net/tlsproxy.js';
import { deriveProfile } from '../src/profile/derive.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Platform behaviour that cannot be exercised by running here. The macOS path
 * in particular is reachable only by passing the platform in, so these tests
 * are the only thing standing between a macOS user and a font layer that
 * silently does nothing.
 */

test('fontconfig is Linux-only', () => {
  assert.equal(fontconfigSupported('linux'), true);
  assert.equal(fontconfigSupported('freebsd'), true);
  assert.equal(fontconfigSupported('darwin'), false);
  assert.equal(fontconfigSupported('win32'), false);
});

test('macOS reports the font restriction as inactive, with a reason', async () => {
  const profile = deriveProfile({ deviceId: 'pixel-8-pro', seed: 'x' });
  const dir = await mkdtemp(join(tmpdir(), 'andro-fonts-'));
  const fontsDir = await mkdtemp(join(tmpdir(), 'andro-faces-'));
  await writeFile(join(fontsDir, 'Roboto.ttf'), 'not really a font');

  try {
    const res = prepareFonts(profile, { fontsDir, dir, platform: 'darwin' });

    assert.equal(res.active, false, 'CoreText cannot be constrained; must not claim otherwise');
    assert.deepEqual(res.env, {}, 'FONTCONFIG_FILE would be ignored, so it must not be set');
    assert.match(res.reason, /CoreText/);
    assert.match(res.reason, /Linux/, 'the reason should say where the layer does work');

    // No config file should have been written: a file on disk implies it took
    // effect, and someone reading the directory later would believe it had.
    await assert.rejects(access(join(dir, 'fonts.conf')));

    const win = prepareFonts(profile, { fontsDir, dir, platform: 'win32' });
    assert.equal(win.active, false);
    assert.match(win.reason, /DirectWrite/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(fontsDir, { recursive: true, force: true });
  }
});

test('Linux with a populated directory reports the restriction as active', async () => {
  const profile = deriveProfile({ deviceId: 'pixel-8-pro', seed: 'x' });
  const dir = await mkdtemp(join(tmpdir(), 'andro-fonts-'));
  const fontsDir = await mkdtemp(join(tmpdir(), 'andro-faces-'));
  await writeFile(join(fontsDir, 'Roboto.ttf'), 'not really a font');

  try {
    const res = prepareFonts(profile, { fontsDir, dir, platform: 'linux' });
    assert.equal(res.active, true);
    assert.ok(res.env.FONTCONFIG_FILE, 'the browser needs to be pointed at the config');
    await access(res.env.FONTCONFIG_FILE);
    assert.match(res.reason, /1 face/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(fontsDir, { recursive: true, force: true });
  }
});

test('no fontsDir is inactive on every platform, without erroring', () => {
  const profile = deriveProfile({ deviceId: 'pixel-8-pro', seed: 'x' });
  for (const platform of ['linux', 'darwin', 'win32']) {
    const res = prepareFonts(profile, { fontsDir: null, dir: '/nonexistent', platform });
    assert.equal(res.active, false);
    assert.deepEqual(res.env, {});
    assert.ok(res.reason.length > 0);
  }
});

test('an empty or missing font directory fails loudly on Linux', async () => {
  const profile = deriveProfile({ deviceId: 'pixel-8-pro', seed: 'x' });
  const dir = await mkdtemp(join(tmpdir(), 'andro-fonts-'));
  const empty = await mkdtemp(join(tmpdir(), 'andro-empty-'));
  try {
    assert.throws(
      () => prepareFonts(profile, { fontsDir: '/definitely/not/here', dir, platform: 'linux' }),
      /does not exist/
    );
    assert.throws(
      () => prepareFonts(profile, { fontsDir: empty, dir, platform: 'linux' }),
      /no font files/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(empty, { recursive: true, force: true });
  }
});

test('proxy binary names use Node\'s platform and arch vocabulary', () => {
  // Go says amd64 where Node says x64; the resolver runs under Node, so Node's
  // spelling is the one that has to win.
  assert.equal(proxyBinaryName('darwin', 'arm64'), 'tlsproxy-darwin-arm64');
  assert.equal(proxyBinaryName('darwin', 'x64'), 'tlsproxy-darwin-x64');
  assert.equal(proxyBinaryName('linux', 'x64'), 'tlsproxy-linux-x64');
  assert.ok(!proxyBinaryName('darwin', 'x64').includes('amd64'));

  // Windows refuses to execute a file with no executable extension, so the
  // suffix belongs to the name and not to whoever happens to spawn it.
  assert.equal(proxyBinaryName('win32', 'x64'), 'tlsproxy-win32-x64.exe');
  assert.equal(proxyBinaryName('win32', 'arm64'), 'tlsproxy-win32-arm64.exe');
  for (const p of ['linux', 'darwin']) {
    assert.ok(!proxyBinaryName(p, 'x64').endsWith('.exe'), `${p} must not get .exe`);
  }
});

test('built releases contain binaries the resolver would find', async (t) => {
  // The packager and the resolver must agree on the filename, which is the
  // whole reason proxyBinaryName is shared rather than duplicated. On Windows
  // that agreement includes the .exe suffix.
  const targets = [
    ['android-emulator-macos', 'darwin'],
    ['android-emulator-windows', 'win32'],
    ['android-emulator-linux', 'linux'],
  ];
  let checked = 0;
  for (const [stage, platform] of targets) {
    const binDir = join(ROOT, 'dist', stage, 'tools', 'tlsproxy', 'bin');
    try {
      await access(binDir);
    } catch {
      continue;
    }
    for (const arch of ['arm64', 'x64']) {
      await access(join(binDir, proxyBinaryName(platform, arch)));
    }
    checked++;
  }
  if (checked === 0) return t.skip('no release built; run tools/build-release.mjs <target>');
});
