#!/usr/bin/env node
/**
 * Launch city-gating regression. Runs with the DEFAULT open-cities config
 * (Wrocław only) — sign-ups in any other ("coming soon") city are rejected
 * server-side, and /api/cities advertises which cities are open.
 */
'use strict';
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4097;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-city-'));

function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + p, { method, headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
    } }, (res) => { let s = ''; res.on('data', (d) => (s += d)); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, json: j }); }); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReady(n = 50) { for (let i = 0; i < n; i++) { try { if ((await req('GET', '/healthz')).status === 200) return; } catch {} await sleep(100); } throw new Error('server not ready'); }

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log('  ok -', name); };
const reg = (city, tag) => req('POST', '/api/register', { body: { name: 'C', email: `city${tag}${Date.now()}@t.co`, password: 'Passw0rd!Long1', role: 'customer', city, phone: '+48512345600' } });

async function main() {
  // No LUMI_OPEN_CITIES → default (Wrocław only).
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), LUMI_DATA_DIR: DATA, LUMI_QUIET: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  try {
    await waitReady();
    await ok('/api/cities advertises the open set (Wrocław only)', async () => {
      const r = await req('GET', '/api/cities');
      assert.deepStrictEqual(r.json.open, ['Wrocław']);
      assert.ok(r.json.cities.length > 1, 'all cities still listed (for "coming soon")');
    });
    await ok('sign-up in a coming-soon city is rejected (CITY_CLOSED)', async () => {
      const r = await reg('Warsaw', 'w');
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.json.code, 'CITY_CLOSED');
    });
    await ok('sign-up in Wrocław succeeds', async () => {
      const r = await reg('Wrocław', 'o');
      assert.strictEqual(r.status, 200);
      assert.ok(r.json.token);
      assert.strictEqual(r.json.user.city, 'Wrocław');
    });
    await ok('a missing/garbage city is rejected too (defaults are not silently opened)', async () => {
      const r = await reg('Atlantis', 'g');
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.json.code, 'CITY_CLOSED');
    });
    console.log(`\n${passed} city-gating checks passed.`);
  } catch (e) {
    console.error('CITY-GATING TEST FAILED:', e.message);
    child.kill('SIGKILL'); process.exit(1);
  }
  child.kill('SIGKILL');
  process.exit(0);
}
main();
