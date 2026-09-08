/**
 * The JSON store must never turn damage into an empty database.
 *
 * The original code wrote straight onto the live file and read it back under a
 * blanket try/catch. An interrupted write left a truncated file; the next start
 * parsed it, silently got `{}`, seeded the demo dataset over the top and served
 * /healthz 200 while every real account was gone. Reproduced before the fix:
 * a registered customer could no longer log in and the store held 8 demo users.
 *
 * These checks drive the real server process, because that is where the damage
 * happened — at startup, not in a helper.
 */
'use strict';
const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const SERVER = path.join(__dirname, '..', 'server.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); } };

let port = 4310 + Math.floor(Math.random() * 200);
const req = (p, method, body, portNum) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request({ host: '127.0.0.1', port: portNum, path: p, method: method || 'GET',
    headers: { 'content-type': 'application/json', ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } },
  (res) => { let s = ''; res.on('data', (d) => (s += d)); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, json: j }); }); });
  r.on('error', reject); if (data) r.write(data); r.end();
});
const start = async (dir, p) => {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(p), LUMI_DATA_DIR: dir, LUMI_QUIET: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await req('/healthz', 'GET', null, p)).status === 200) return { child, err: () => err }; } catch {}
    if (child.exitCode !== null) break;
    await sleep(100);
  }
  return { child, err: () => err, dead: true };
};
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-store-'));
const CUSTOMER = { name: 'Real Client', email: 'real@lumi24.pl', password: 'averylongpassword', phone: '600700800', acceptedTerms: true };

(async () => {
  // ── 1. every write is atomic and keeps the previous generation ──
  const dir = tmpdir();
  const p1 = port++;
  await ok('a write leaves a complete file plus a .bak, never a half-written one', async () => {
    const s = await start(dir, p1);
    assert.ok(!s.dead, 'server started');
    const cities = (await req('/api/cities', 'GET', null, p1)).json;
    await req('/api/register', 'POST', { ...CUSTOMER, city: (cities.open || ['Wrocław'])[0] }, p1);
    s.child.kill('SIGKILL');
    await sleep(200);
    assert.ok(fs.existsSync(path.join(dir, 'users.json.bak')), 'previous generation kept');
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8')), 'live file parses');
    assert.ok(!fs.existsSync(path.join(dir, 'users.json.tmp')), 'no scratch file left behind');
  });

  // ── 2. a truncated live file is recovered, not papered over ──
  const p2 = port++;
  await ok('a corrupt live file is recovered from .bak and preserved for forensics', async () => {
    const file = path.join(dir, 'users.json');
    const whole = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, whole.slice(0, 120));                 // an interrupted write
    const s = await start(dir, p2);
    assert.ok(!s.dead, 'the service still comes up');
    const users = JSON.parse(fs.readFileSync(path.join(dir, 'users.json.bak'), 'utf8'));
    assert.ok(Object.keys(users).length > 0, 'the backup carries real data');
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('users.json.corrupt-')), 'the damaged file is kept, not deleted');
    assert.ok(/recovered from \.bak/.test(s.err()), 'and it is announced in the log, not silent');
    s.child.kill('SIGKILL');
    await sleep(200);
  });

  // ── 3. unrecoverable damage must stop the server, not reset it ──
  const p3 = port++;
  await ok('with both copies damaged the server refuses to start instead of wiping the store', async () => {
    const dead = tmpdir();
    const file = path.join(dead, 'users.json');
    fs.writeFileSync(file, '{"broken');
    fs.writeFileSync(file + '.bak', '{"also broken');
    const r = spawnSync(process.execPath, [SERVER], { env: { ...process.env, PORT: String(p3), LUMI_DATA_DIR: dead, LUMI_QUIET: '1' }, encoding: 'utf8', timeout: 20000 });
    assert.strictEqual(r.status, 1, 'exits non-zero');
    assert.ok(/refusing to start/.test(r.stderr), 'says why');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{"broken', 'the damaged file is left untouched for a restore');
  });

  const failed = results.filter((r) => !r[0]);
  for (const [pass, name, err] of results) console.log(`  ${pass ? 'ok' : 'FAIL'} - ${name}${err ? ' → ' + err : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} store-integrity checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('store-integrity.test.js crashed:', e); process.exit(1); });
