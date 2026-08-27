import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm, access, mkdir } from 'node:fs/promises';
import { constants, X509Certificate, createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const PROXY_SRC = join(HERE, '..', '..', 'tools', 'tlsproxy');

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The name a prebuilt proxy binary carries for a given host.
 *
 * Exported because tools/build-release.mjs writes these files and this module
 * looks them up: if the packager and the resolver each derived the name
 * themselves, they would eventually disagree and the archive would ship a
 * binary nothing can find.
 */
export function proxyBinaryName(platform = process.platform, arch = process.arch) {
  // Windows will not execute a file without an executable extension, so the
  // suffix is part of the name rather than something the caller remembers.
  const ext = platform === 'win32' ? '.exe' : '';
  return `tlsproxy-${platform}-${arch}${ext}`;
}

/**
 * Locates the proxy binary, in order: a prebuilt one for this exact
 * platform/arch (what a release archive ships, so Go is not needed to run),
 * then one built here previously, then `go build`.
 */
export async function ensureBinary({ rebuild = false } = {}) {
  const prebuilt = join(PROXY_SRC, 'bin', proxyBinaryName());
  const local = join(PROXY_SRC, 'tlsproxy');

  if (!rebuild) {
    if (await exists(prebuilt)) return prebuilt;
    if (await exists(local)) return local;
  }

  try {
    await execFileAsync('go', ['build', '-o', 'tlsproxy', '.'], {
      cwd: PROXY_SRC,
      timeout: 300_000,
    });
  } catch (err) {
    throw new Error(
      `No TLS proxy binary for ${process.platform}/${process.arch}, and building ` +
        `one failed (${PROXY_SRC}).\n` +
        `Either drop a prebuilt binary at ${prebuilt}, or install Go 1.25+.\n` +
        `Without the proxy the browser's own ClientHello goes on the wire and the ` +
        `TLS fingerprint will not match the emulated device.\n` +
        `${err.stderr || err.message}`
    );
  }
  return local;
}

/**
 * The SPKI pin for the local MITM CA.
 *
 * Chromium is given exactly this one hash via --ignore-certificate-errors-spki-list,
 * which is narrower than --ignore-certificate-errors (and much narrower than
 * ignoreHTTPSErrors): every certificate except ours is still validated
 * normally, so a genuinely broken TLS chain upstream still fails, as it would
 * on the real device.
 */
export function spkiHash(caCertPem) {
  const cert = new X509Certificate(caCertPem);
  const spki = cert.publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(spki).digest('base64');
}

/** Reports the JA3/JA4 a network profile actually produces. */
export async function fingerprint(profilePath, { host = 'www.example.com' } = {}) {
  const bin = await ensureBinary();
  const { stdout } = await execFileAsync(bin, [
    '-profile', profilePath,
    '-print-fingerprint',
    '-fingerprint-host', host,
  ]);
  const out = {};
  for (const line of stdout.split('\n')) {
    const m = /^(\w+):\s+(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return { ...out, raw: stdout };
}

export class TlsProxy {
  constructor({ profilePath, caDir, upstream = '', verbose = false }) {
    this.profilePath = profilePath;
    this.caDir = caDir;
    this.upstream = upstream;
    this.verbose = verbose;
    this.proc = null;
    this.address = null;
    this.caCertPem = null;
  }

  async start() {
    const bin = await ensureBinary();
    await mkdir(this.caDir, { recursive: true });
    const readyFile = join(tmpdir(), `tlsproxy-${process.pid}-${Date.now()}.addr`);

    const args = [
      '-profile', this.profilePath,
      '-ca-dir', this.caDir,
      '-listen', '127.0.0.1:0',
      '-ready-file', readyFile,
    ];
    if (this.upstream) args.push('-upstream', this.upstream);
    if (this.verbose) args.push('-verbose');

    this.proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    this.proc.stderr.on('data', (d) => {
      stderr += d;
      if (this.verbose) process.stderr.write(`[tlsproxy] ${d}`);
    });
    if (this.verbose) this.proc.stdout.on('data', (d) => process.stdout.write(`[tlsproxy] ${d}`));

    const exited = new Promise((_, reject) => {
      this.proc.once('exit', (code) =>
        reject(new Error(`tlsproxy exited with code ${code}\n${stderr}`))
      );
    });

    // The proxy writes its bound address once it is actually serving; polling
    // that file avoids racing the browser launch against the listener.
    const ready = (async () => {
      for (let i = 0; i < 200; i++) {
        if (await exists(readyFile)) {
          const addr = (await readFile(readyFile, 'utf8')).trim();
          if (addr) return addr;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('tlsproxy did not report a listen address within 10s');
    })();

    this.address = await Promise.race([ready, exited]);
    await rm(readyFile, { force: true });
    this.caCertPem = await readFile(join(this.caDir, 'ca.crt'), 'utf8');
    return this.address;
  }

  get proxyUrl() {
    return `http://${this.address}`;
  }

  get spki() {
    return spkiHash(this.caCertPem);
  }

  async stop() {
    if (!this.proc) return;
    const p = this.proc;
    this.proc = null;
    p.removeAllListeners('exit');
    p.kill('SIGTERM');
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        p.kill('SIGKILL');
        resolve();
      }, 3000);
      p.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}
