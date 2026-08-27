#!/usr/bin/env node
/**
 * Builds the TLS proxy for the machine it runs on.
 *
 *   npm run build:proxy
 *
 * Writes to tools/tlsproxy/bin/<proxyBinaryName()> — the one place the runtime
 * resolver looks. The shell one-liner this replaced (`go build -o tlsproxy .`)
 * was wrong on Windows twice over: `cd tools/tlsproxy` with forward slashes is
 * not reliable in cmd, and `go build -o tlsproxy` writes a file with no .exe
 * extension, which Windows will not execute and the resolver will not find.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { proxyBinaryName } from '../src/net/tlsproxy.js';

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tools', 'tlsproxy');

const name = proxyBinaryName();
const out = join(SRC, 'bin', name);

await mkdir(join(SRC, 'bin'), { recursive: true });

try {
  await exec('go', ['build', '-trimpath', '-ldflags', '-s -w', '-o', out, '.'], {
    cwd: SRC,
    timeout: 600_000,
    env: { ...process.env, CGO_ENABLED: '0' },
  });
} catch (err) {
  console.error(
    `Building the TLS proxy failed. Go 1.25+ is required.\n${err.stderr || err.message}`
  );
  process.exit(1);
}

const { size } = await stat(out);
console.log(`${out}  (${(size / 1e6).toFixed(1)} MB)`);
