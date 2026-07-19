/**
 * Native push notifications via Firebase Cloud Messaging (HTTP v1).
 *
 * Optional and config-driven, exactly like the mailer/vision modules: with no
 * service-account configured it is a safe no-op (send() resolves { skipped:true })
 * and nothing else changes. One FCM project covers BOTH platforms — Android
 * receives directly, iOS via FCM's APNs bridge — so device tokens are always FCM
 * registration tokens regardless of platform.
 *
 * Env (server only — secret goes in deploy/instance.local.env, never in git):
 *   LUMI_FCM_PROJECT_ID     Firebase project id
 *   LUMI_FCM_CLIENT_EMAIL   service-account email
 *   LUMI_FCM_PRIVATE_KEY    service-account private key (PEM; \n may be escaped)
 *
 * The network calls never throw into the request path — failures resolve, and a
 * token FCM reports as unregistered is returned so the caller can prune it.
 */
'use strict';

const https = require('https');
const crypto = require('crypto');

function config() {
  return {
    projectId: (process.env.LUMI_FCM_PROJECT_ID || '').trim(),
    clientEmail: (process.env.LUMI_FCM_CLIENT_EMAIL || '').trim(),
    // Allow the PEM to be stored with literal \n (common in env files).
    privateKey: (process.env.LUMI_FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim(),
  };
}
function isEnabled() { const c = config(); return !!(c.projectId && c.clientEmail && c.privateKey); }

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

// Build the FCM HTTP v1 message body for one device token. Pure + testable.
function buildMessage(token, msg) {
  msg = msg || {};
  const data = {};
  if (msg.deepLink) data.deepLink = String(msg.deepLink);
  if (msg.bookingId) data.bookingId = String(msg.bookingId);
  if (msg.data) for (const k of Object.keys(msg.data)) data[k] = String(msg.data[k]);
  return {
    message: {
      token,
      notification: { title: String(msg.title || 'LUMI'), body: String(msg.body || '') },
      data,
      android: { priority: msg.priority === 'urgent' || msg.priority === 'high' ? 'high' : 'normal' },
      apns: { payload: { aps: { sound: 'default' } } },
    },
  };
}

// ── OAuth2 access token from the service account (cached until ~expiry) ──
let _tok = { value: null, exp: 0 };
function accessToken() {
  return new Promise((resolve) => {
    const c = config();
    if (!c.privateKey) return resolve(null);
    if (_tok.value && Date.now() < _tok.exp - 60000) return resolve(_tok.value);
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
      iss: c.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    }));
    let sig;
    try { sig = b64url(crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(c.privateKey)); }
    catch { return resolve(null); }
    const body = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${header}.${claim}.${sig}`;
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', timeout: 15000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (resp) => {
      let d = ''; resp.on('data', (x) => (d += x));
      resp.on('end', () => { try { const j = JSON.parse(d); if (j.access_token) { _tok = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return resolve(j.access_token); } } catch {} resolve(null); });
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

function postOne(projectId, bearer, token, msg) {
  return new Promise((resolve) => {
    const body = JSON.stringify(buildMessage(token, msg));
    const req = https.request({
      hostname: 'fcm.googleapis.com', path: `/v1/projects/${projectId}/messages:send`, method: 'POST', timeout: 15000,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer, 'Content-Length': Buffer.byteLength(body) },
    }, (resp) => {
      let d = ''; resp.on('data', (x) => (d += x));
      resp.on('end', () => {
        // 404/UNREGISTERED → token is dead and should be pruned by the caller.
        const dead = resp.statusCode === 404 || /UNREGISTERED|InvalidRegistration|NotRegistered/i.test(d);
        resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, dead, token });
      });
    });
    req.on('error', () => resolve({ ok: false, dead: false, token }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, dead: false, token }); });
    req.write(body); req.end();
  });
}

// Send to many tokens. Resolves { sent, failed, dead:[tokens] } — never throws.
async function send(tokens, msg) {
  const list = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
  if (!isEnabled() || !list.length) return { skipped: true, sent: 0, failed: 0, dead: [] };
  const bearer = await accessToken();
  if (!bearer) return { skipped: true, sent: 0, failed: list.length, dead: [] };
  const c = config();
  const results = await Promise.all(list.map((t) => postOne(c.projectId, bearer, t, msg)));
  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    dead: results.filter((r) => r.dead).map((r) => r.token),
  };
}

module.exports = { isEnabled, config, buildMessage, send };
