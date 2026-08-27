import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listDevices, getDevice } from '../../profiles/devices.js';
import { LOCALES } from '../../profiles/network.js';
import { deriveProfile } from '../profile/derive.js';
import { writeNetworkProfile } from '../net/profile.js';
import { fingerprint } from '../net/tlsproxy.js';
import { launchDevice } from '../session.js';
import { verifyInSession, summarize } from '../verify/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public');

/**
 * Local control panel.
 *
 * Everything here is a thin shell over the same `launchDevice` the CLI uses —
 * the GUI must not become a second way of building an identity, or the two
 * would drift and the panel would start showing something the browser is not
 * actually doing. It configures, launches, mirrors and verifies; it derives
 * nothing of its own.
 *
 * The live view is a CDP screencast: Chromium pushes JPEG frames, the page
 * draws them in a phone bezel, and taps/scrolls travel back as real touch
 * events. That keeps the emulated browser a normal browser — nothing about the
 * mirroring is visible to the page being viewed.
 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** One running emulated device plus everyone watching it. */
class LiveSession {
  constructor(id, session, options) {
    this.id = id;
    this.session = session;
    this.options = options;
    this.page = null;
    this.cdp = null;
    this.watchers = new Set();
    this.lastFrame = null;
    this.startedAt = Date.now();
  }

  get profile() {
    return this.session.profile;
  }

  async attach() {
    const pages = this.session.pages;
    this.page = pages[0] || (await this.session.newPage());
    await this.page.goto('about:blank').catch(() => {});
    await this.startScreencast();
  }

  async startScreencast() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    const s = this.profile.js.screen;
    this.cdp.on('Page.screencastFrame', async (frame) => {
      this.lastFrame = frame.data;
      for (const w of this.watchers) {
        // A slow watcher must not stall the stream; SSE writes are fire and
        // forget and the next frame supersedes anything queued.
        w.write(`data: ${frame.data}\n\n`);
      }
      try {
        await this.cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
      } catch (e) {
        /* the page went away between frame and ack */
      }
    });
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 70,
      maxWidth: Math.round(s.width * s.dpr),
      maxHeight: Math.round(s.height * s.dpr),
      everyNthFrame: 1,
    });
  }

  addWatcher(res) {
    this.watchers.add(res);
    if (this.lastFrame) res.write(`data: ${this.lastFrame}\n\n`);
  }

  removeWatcher(res) {
    this.watchers.delete(res);
  }

  toJSON() {
    const p = this.profile;
    return {
      id: this.id,
      deviceId: p.deviceId,
      deviceName: p.deviceName,
      seedId: p.seedId,
      locale: p.locale.tag,
      timezone: p.js.timezone,
      userAgent: p.js.userAgent,
      model: p.js.uaData.model,
      chrome: p.device.browser.full,
      gpu: p.js.webgl.unmaskedRenderer,
      screen: `${p.js.screen.width}x${p.js.screen.height}@${p.js.screen.dpr}`,
      viewport: p.launch.viewport,
      upstream: this.options.upstream || null,
      fontsActive: this.session.fonts.active,
      fontsReason: this.session.fonts.reason,
      url: this.page ? this.page.url() : null,
      startedAt: this.startedAt,
    };
  }

  async close() {
    for (const w of this.watchers) {
      try { w.end(); } catch (e) { /* already gone */ }
    }
    this.watchers.clear();
    try {
      if (this.cdp) await this.cdp.send('Page.stopScreencast').catch(() => {});
      if (this.cdp) await this.cdp.detach().catch(() => {});
    } finally {
      await this.session.close();
    }
  }
}

const sessions = new Map();
let nextId = 1;

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  // Contain path traversal: only files directly inside public/ are served.
  if (rel.includes('..') || rel.includes('/')) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const body = await readFile(join(PUBLIC, rel));
    res.writeHead(200, {
      'content-type': MIME[extname(rel)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

function requireSession(res, id) {
  const s = sessions.get(id);
  if (!s) {
    json(res, 404, { error: `session ${id} is not running` });
    return null;
  }
  return s;
}

const ROUTES = {
  async 'GET /api/config'(req, res) {
    json(res, 200, {
      devices: listDevices().map((d) => {
        const full = getDevice(d.id);
        return {
          ...d,
          chrome: full.browser.major,
          gpu: full.gpu.unmaskedRenderer,
          screen: `${full.screen.width}x${full.screen.height}@${full.screen.dpr}`,
          model: full.model,
        };
      }),
      locales: Object.entries(LOCALES).map(([tag, l]) => ({
        tag,
        timezone: l.timezone,
        country: l.country,
      })),
      platform: process.platform,
    });
  },

  /** Profile preview — derivation needs no browser, so the panel can show the
   *  identity before anything is launched. */
  async 'POST /api/preview'(req, res, body) {
    const profile = deriveProfile({
      deviceId: body.deviceId,
      locale: body.locale,
      seed: body.seed || 'default-seed',
      timezone: body.timezone || undefined,
    });
    json(res, 200, {
      seedId: profile.seedId,
      userAgent: profile.js.userAgent,
      model: profile.js.uaData.model,
      platformVersion: profile.js.uaData.platformVersion,
      chrome: profile.device.browser.full,
      gpu: profile.js.webgl.unmaskedRenderer,
      screen: `${profile.js.screen.width}x${profile.js.screen.height}@${profile.js.screen.dpr}`,
      timezone: profile.js.timezone,
      languages: profile.js.languages,
      acceptLanguage: profile.net.acceptLanguage,
      secChUa: profile.net.clientHints['sec-ch-ua'],
      tlsTemplate: profile.net.tls.utls,
      cores: profile.js.hardwareConcurrency,
      memory: profile.js.deviceMemory,
    });
  },

  /** JA3/JA4 the profile actually produces, from the real ClientHello. */
  async 'POST /api/tls'(req, res, body) {
    const profile = deriveProfile({
      deviceId: body.deviceId,
      locale: body.locale,
      seed: body.seed || 'default-seed',
    });
    const dir = join(process.cwd(), 'profiles-data', `${profile.deviceId}-${profile.seedId}`);
    const path = join(dir, 'network.json');
    await writeNetworkProfile(profile, path, { upstream: body.upstream || '' });
    json(res, 200, await fingerprint(path, { host: body.host || 'www.example.com' }));
  },

  async 'GET /api/sessions'(req, res) {
    json(res, 200, [...sessions.values()].map((s) => s.toJSON()));
  },

  async 'POST /api/sessions'(req, res, body) {
    const session = await launchDevice({
      deviceId: body.deviceId,
      locale: body.locale || 'en-US',
      seed: body.seed || 'default-seed',
      timezone: body.timezone || undefined,
      upstream: body.upstream || '',
      publicIp: body.publicIp || null,
      fontsDir: body.fontsDir || null,
      headless: body.headless !== false,
    });
    const id = String(nextId++);
    const live = new LiveSession(id, session, body);
    sessions.set(id, live);
    try {
      await live.attach();
      if (body.url) {
        await live.page.goto(body.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
          .catch(() => {});
      }
    } catch (err) {
      sessions.delete(id);
      await live.close().catch(() => {});
      throw err;
    }
    json(res, 200, live.toJSON());
  },

  async 'DELETE /api/sessions/:id'(req, res, body, [id]) {
    const s = requireSession(res, id);
    if (!s) return;
    sessions.delete(id);
    await s.close();
    json(res, 200, { closed: id });
  },

  async 'POST /api/sessions/:id/navigate'(req, res, body, [id]) {
    const s = requireSession(res, id);
    if (!s) return;
    let url = String(body.url || '').trim();
    if (url && !/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
    try {
      await s.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      json(res, 200, { url: s.page.url() });
    } catch (err) {
      json(res, 200, { url: s.page.url(), error: err.message });
    }
  },

  async 'POST /api/sessions/:id/action'(req, res, body, [id]) {
    const s = requireSession(res, id);
    if (!s) return;
    const p = s.page;
    try {
      switch (body.type) {
        // Taps go through the touchscreen, not the mouse: the emulated device
        // has no mouse, and a page listening for pointer events should see the
        // same thing a real phone would produce.
        case 'tap':
          await p.touchscreen.tap(body.x, body.y);
          break;
        case 'scroll':
          await p.mouse.wheel(0, body.dy || 0);
          break;
        case 'type':
          await p.keyboard.type(String(body.text || ''), { delay: 30 });
          break;
        case 'key':
          await p.keyboard.press(String(body.key || 'Enter'));
          break;
        case 'back':
          await p.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 });
          break;
        case 'forward':
          await p.goForward({ waitUntil: 'domcontentloaded', timeout: 30_000 });
          break;
        case 'reload':
          await p.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
          break;
        default:
          return json(res, 400, { error: `unknown action ${body.type}` });
      }
      json(res, 200, { url: p.url() });
    } catch (err) {
      json(res, 200, { url: p.url(), error: err.message });
    }
  },

  /** Exactly what `andro verify` runs, on the session already open. It uses a
   *  throwaway page on a local origin, so the mirrored tab stays put. */
  async 'POST /api/sessions/:id/verify'(req, res, body, [id]) {
    const s = requireSession(res, id);
    if (!s) return;
    const { checks } = await verifyInSession(s.session);
    json(res, 200, { summary: summarize(checks), checks });
  },
};

/** SSE screencast stream. Kept out of ROUTES because it never ends. */
function streamScreen(req, res, id) {
  const s = sessions.get(id);
  if (!s) {
    res.writeHead(404).end('no such session');
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 1000\n\n');
  s.addWatcher(res);
  req.on('close', () => s.removeWatcher(res));
}

function matchRoute(method, path) {
  for (const key of Object.keys(ROUTES)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const re = new RegExp(`^${pattern.replace(/:[^/]+/g, '([^/]+)')}$`);
    const hit = re.exec(path);
    if (hit) return { handler: ROUTES[key], params: hit.slice(1) };
  }
  return null;
}

export async function startGui({ port = 7333, host = '127.0.0.1' } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    try {
      const screen = /^\/api\/sessions\/([^/]+)\/screen$/.exec(path);
      if (req.method === 'GET' && screen) return streamScreen(req, res, screen[1]);

      if (path.startsWith('/api/')) {
        const route = matchRoute(req.method, path);
        if (!route) return json(res, 404, { error: 'no such endpoint' });
        const body = req.method === 'GET' ? {} : await readJsonBody(req);
        return await route.handler(req, res, body, route.params);
      }

      if (req.method === 'GET') return await serveStatic(res, path);
      res.writeHead(405).end('method not allowed');
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: err.message });
      else res.end();
    }
  });

  // The panel drives real browsers; leaving them running after the server dies
  // would leak processes and, worse, leave the TLS proxies listening.
  const shutdown = async () => {
    for (const s of sessions.values()) await s.close().catch(() => {});
    sessions.clear();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return { server, url: `http://${host}:${server.address().port}/` };
}
