#!/usr/bin/env node
/**
 * Builds a release archive for one platform.
 *
 *   node tools/build-release.mjs macos [--out dist]
 *   node tools/build-release.mjs linux
 *
 * The archive carries the JS sources and a prebuilt TLS proxy for every
 * architecture of the target platform, so the recipient needs Node and
 * Playwright but not Go. Cross-compiling is safe here because the proxy is pure
 * Go: CGO is off, which also means the pure-Go DNS resolver rather than the
 * host's, and that is the intended behaviour — resolution should follow the
 * proxy's route, not the machine's.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm, cp, writeFile, readFile, chmod, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { proxyBinaryName } from '../src/net/tlsproxy.js';

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = {
  macos: {
    label: 'macOS',
    archs: [
      { goos: 'darwin', goarch: 'arm64', nodePlatform: 'darwin', nodeArch: 'arm64', note: 'Apple Silicon' },
      { goos: 'darwin', goarch: 'amd64', nodePlatform: 'darwin', nodeArch: 'x64', note: 'Intel' },
    ],
  },
  windows: {
    label: 'Windows',
    // The double-clickable front door. Only Windows gets one: on macOS and
    // Linux the terminal is the normal way in, and an unsigned binary there
    // buys nothing.
    launcher: { name: 'AndroidEmulator.exe', goos: 'windows', goarch: 'amd64' },
    // zip rather than tar.gz: Explorer opens it on a double click, and the
    // executable bit that tar preserves means nothing to Windows anyway.
    format: 'zip',
    archs: [
      { goos: 'windows', goarch: 'amd64', nodePlatform: 'win32', nodeArch: 'x64', note: 'x86-64' },
      { goos: 'windows', goarch: 'arm64', nodePlatform: 'win32', nodeArch: 'arm64', note: 'ARM64' },
    ],
  },
  linux: {
    label: 'Linux',
    archs: [
      { goos: 'linux', goarch: 'amd64', nodePlatform: 'linux', nodeArch: 'x64', note: 'x86-64' },
      { goos: 'linux', goarch: 'arm64', nodePlatform: 'linux', nodeArch: 'arm64', note: 'ARM64' },
    ],
  },
};

/** Everything the archive needs to run. Excludes node_modules, build output and
 *  per-device state, all of which are recreated on the target machine. */
const PAYLOAD = [
  'bin',
  'docs',
  'examples',
  'profiles',
  'src',
  'test',
  'package.json',
  'package-lock.json',
  'README.md',
  'install-macos.sh',
  'install-windows.ps1',
];

async function buildProxy(arch, outDir) {
  // Named by the same function the runtime resolver uses, so the two cannot
  // drift apart. `arch.node` is Node's name for the architecture, which is not
  // always Go's: Go says amd64 where Node says x64.
  const name = proxyBinaryName(arch.nodePlatform, arch.nodeArch);
  const out = join(outDir, name);
  await exec(
    'go',
    ['build', '-trimpath', '-ldflags', '-s -w', '-o', out, '.'],
    {
      cwd: join(ROOT, 'tools', 'tlsproxy'),
      timeout: 600_000,
      env: { ...process.env, GOOS: arch.goos, GOARCH: arch.goarch, CGO_ENABLED: '0' },
    }
  );
  await chmod(out, 0o755);
  const { size } = await stat(out);
  return { name, out, size };
}

/** Builds the double-click launcher for targets that ship one. */
async function buildLauncher(target, stage) {
  if (!target.launcher) return null;
  const { name, goos, goarch } = target.launcher;
  const out = join(stage, name);
  await exec(
    'go',
    [
      'build', '-trimpath',
      // -H windowsgui: no console window behind the app. Errors reach the user
      // through a message box instead, since there is nowhere to print them.
      '-ldflags', '-s -w -H windowsgui',
      '-o', out, '.',
    ],
    {
      cwd: join(ROOT, 'tools', 'launcher'),
      timeout: 600_000,
      env: { ...process.env, GOOS: goos, GOARCH: goarch, CGO_ENABLED: '0' },
    }
  );
  const { size } = await stat(out);
  return { name, out, size };
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main() {
  const [targetName, ...rest] = process.argv.slice(2);
  const target = TARGETS[targetName];
  if (!target) {
    console.error(`usage: node tools/build-release.mjs <${Object.keys(TARGETS).join('|')}> [--out dir]`);
    process.exitCode = 1;
    return;
  }
  const outFlag = rest.indexOf('--out');
  const outDir = resolve(outFlag >= 0 ? rest[outFlag + 1] : join(ROOT, 'dist'));

  const stageName = `android-emulator-${targetName}`;
  const stage = join(outDir, stageName);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });

  console.log(`staging ${target.label} release in ${stage}`);
  for (const item of PAYLOAD) {
    await cp(join(ROOT, item), join(stage, item), { recursive: true });
  }

  // Go sources travel too: the archive should be buildable, not just runnable.
  const proxySrc = join(stage, 'tools', 'tlsproxy');
  await mkdir(proxySrc, { recursive: true });
  for (const f of await readdir(join(ROOT, 'tools', 'tlsproxy'))) {
    if (f.endsWith('.go') || f === 'go.mod' || f === 'go.sum') {
      await cp(join(ROOT, 'tools', 'tlsproxy', f), join(proxySrc, f));
    }
  }
  await cp(join(ROOT, 'tools', 'fetch-fonts.mjs'), join(stage, 'tools', 'fetch-fonts.mjs'));
  await cp(join(ROOT, 'tools', 'build-release.mjs'), join(stage, 'tools', 'build-release.mjs'));

  const binDir = join(proxySrc, 'bin');
  await mkdir(binDir, { recursive: true });

  const built = [];
  for (const arch of target.archs) {
    process.stdout.write(`  tlsproxy ${arch.goos}/${arch.goarch} (${arch.note}) ... `);
    const info = await buildProxy(arch, binDir);
    built.push({ ...info, arch });
    console.log(`${(info.size / 1e6).toFixed(1)} MB`);
  }

  const launcher = await buildLauncher(target, stage);
  if (launcher) {
    console.log(`  ${launcher.name} ... ${(launcher.size / 1e6).toFixed(1)} MB`);
  }

  // Go sources for the launcher travel with the archive too.
  const launcherSrc = join(stage, 'tools', 'launcher');
  await mkdir(launcherSrc, { recursive: true });
  for (const f of await readdir(join(ROOT, 'tools', 'launcher'))) {
    if (f.endsWith('.go') || f === 'go.mod') {
      await cp(join(ROOT, 'tools', 'launcher', f), join(launcherSrc, f));
    }
  }

  await writeFile(
    join(stage, 'VERSION'),
    JSON.stringify(
      {
        target: targetName,
        builtAt: new Date().toISOString(),
        node: process.version,
        launcher: launcher
          ? { file: launcher.name, sha256: await sha256(launcher.out) }
          : null,
        proxies: await Promise.all(
          built.map(async (b) => ({
            file: `tools/tlsproxy/bin/${b.name}`,
            goos: b.arch.goos,
            goarch: b.arch.goarch,
            sha256: await sha256(b.out),
          }))
        ),
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  // tar.gz elsewhere: it preserves the executable bit on the proxy binaries
  // without depending on how the recipient's unarchiver behaves.
  const format = target.format || 'tar.gz';
  const archive = join(outDir, `${stageName}.${format}`);
  await rm(archive, { force: true });
  if (format === 'zip') {
    await exec('zip', ['-qr', archive, stageName], { cwd: outDir, timeout: 300_000 });
  } else {
    await exec('tar', ['-czf', archive, '-C', outDir, stageName], { timeout: 300_000 });
  }

  const { size } = await stat(archive);
  console.log(`\n${archive}`);
  console.log(`${(size / 1e6).toFixed(1)} MB, sha256 ${await sha256(archive)}`);
}

main().catch((err) => {
  console.error(err.stderr || err.message || err);
  process.exitCode = 1;
});
