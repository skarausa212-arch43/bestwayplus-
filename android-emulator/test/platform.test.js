import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, access, readFile, stat } from 'node:fs/promises';
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

test('the universal binary builder produces a parsable fat Mach-O', async () => {
  const { makeUniversal } = await import('../tools/macho-fat.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'andro-fat-'));
  try {
    // Two minimal 64-bit Mach-O headers, differing only in architecture.
    const thin = (cpuType, cpuSubType, filler) => {
      const b = Buffer.alloc(4096, filler);
      b.writeUInt32LE(0xfeedfacf, 0);
      b.writeUInt32LE(cpuType, 4);
      b.writeUInt32LE(cpuSubType, 8);
      return b;
    };
    const arm = join(dir, 'arm');
    const x86 = join(dir, 'x86');
    await writeFile(arm, thin(0x0100000c, 0, 0x11));
    await writeFile(x86, thin(0x01000007, 3, 0x22));

    const out = join(dir, 'fat');
    const res = await makeUniversal([arm, x86], out);
    assert.equal(res.slices, 2);

    const fat = await readFile(out);
    assert.equal(fat.readUInt32BE(0), 0xcafebabe, 'fat magic');
    assert.equal(fat.readUInt32BE(4), 2, 'arch count');

    for (let i = 0; i < 2; i++) {
      const at = 8 + i * 20;
      const offset = fat.readUInt32BE(at + 8);
      const size = fat.readUInt32BE(at + 12);
      const align = fat.readUInt32BE(at + 16);
      // A misaligned slice is one the loader will refuse.
      assert.equal(offset % (1 << align), 0, `slice ${i} alignment`);
      assert.equal(size, 4096, `slice ${i} size`);
      assert.equal(
        fat.readUInt32LE(offset), 0xfeedfacf,
        `slice ${i} must still start with its own Mach-O magic`
      );
    }

    // The same architecture twice would silently produce a binary macOS
    // rejects, so it is refused up front.
    await assert.rejects(() => makeUniversal([arm, arm], out), /same architecture|share architecture/);
    await assert.rejects(
      () => makeUniversal([join(dir, 'arm'), join(dir, 'nope')], out),
      /ENOENT/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a built macOS release contains a well-formed .app bundle', async (t) => {
  const app = join(ROOT, 'dist', 'android-emulator-macos', 'AndroidEmulator.app');
  try {
    await access(app);
  } catch {
    return t.skip('no macOS release built; run tools/build-release.mjs macos');
  }

  const plist = await readFile(join(app, 'Contents', 'Info.plist'), 'utf8');
  const exeName = /<key>CFBundleExecutable<\/key><string>([^<]+)<\/string>/.exec(plist)?.[1];
  assert.ok(exeName, 'Info.plist must name an executable');

  // The plist pointing at a file that is not there is the classic broken
  // bundle: Finder reports only "the application is damaged".
  const exe = join(app, 'Contents', 'MacOS', exeName);
  const st = await stat(exe);
  assert.ok(st.mode & 0o111, 'the bundle executable must be executable');

  const head = await readFile(exe);
  assert.equal(head.readUInt32BE(0), 0xcafebabe, 'expected a universal binary');
  assert.ok(head.readUInt32BE(4) >= 2, 'expected at least two architectures');
  assert.match(plist, /<key>CFBundlePackageType<\/key><string>APPL<\/string>/);
});
