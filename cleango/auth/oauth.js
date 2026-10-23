/**
 * Social sign-in (Google + Apple) — zero dependencies, built on Node crypto +
 * global fetch. Configured entirely via env (no secrets in code):
 *
 *   Google:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   Apple:   APPLE_CLIENT_ID (Services ID), APPLE_TEAM_ID, APPLE_KEY_ID,
 *            APPLE_PRIVATE_KEY (contents of the .p8, newlines as \n or real)
 *
 * The server composes these into /api/auth/:provider/{start,callback} and maps
 * the returned profile to a LUMI account (find-or-create by email). When a
 * provider isn't configured, providers() reports it off and the UI hides it.
 */
'use strict';
const crypto = require('crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const jsonB64 = (o) => b64url(JSON.stringify(o));

function providers() {
  return {
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
  };
}

// ── Google (OpenID Connect authorization-code flow) ──
function googleAuthUrl(redirectUri, state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}
async function googleExchange(code, redirectUri) {
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  if (!tr.ok) throw new Error('google token exchange failed: ' + tr.status);
  const tok = await tr.json();
  const ur = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: 'Bearer ' + tok.access_token } });
  if (!ur.ok) throw new Error('google userinfo failed: ' + ur.status);
  const u = await ur.json();
  return { provider: 'google', sub: u.sub, email: String(u.email || '').toLowerCase(), emailVerified: u.email_verified !== false, name: u.name || u.given_name || '' };
}

// ── Apple (Sign in with Apple) ──
// The client secret is a short-lived ES256 JWT signed with the .p8 key.
function appleClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: process.env.APPLE_KEY_ID, typ: 'JWT' };
  const payload = { iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 3600, aud: 'https://appleid.apple.com', sub: process.env.APPLE_CLIENT_ID };
  const signingInput = jsonB64(header) + '.' + jsonB64(payload);
  const key = crypto.createPrivateKey(String(process.env.APPLE_PRIVATE_KEY).replace(/\\n/g, '\n'));
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  return signingInput + '.' + b64url(sig);
}
function appleAuthUrl(redirectUri, state) {
  const p = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'name email',
    response_mode: 'form_post',   // Apple returns the callback as a POST
    state,
  });
  return 'https://appleid.apple.com/auth/authorize?' + p.toString();
}

// Minimal JWT verification against a provider JWKS (RS256). Used for Apple's
// id_token. Verifies signature, issuer, audience and expiry.
let _jwksCache = { url: null, at: 0, keys: null };
async function jwks(url) {
  if (_jwksCache.url === url && Date.now() - _jwksCache.at < 3600000 && _jwksCache.keys) return _jwksCache.keys;
  const r = await fetch(url);
  if (!r.ok) throw new Error('jwks fetch failed: ' + r.status);
  const { keys } = await r.json();
  _jwksCache = { url, at: Date.now(), keys };
  return keys;
}
async function verifyJwtRS256(token, jwksUrl, { iss, aud }) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('malformed token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const jwk = (await jwks(jwksUrl)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');
  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const okSig = crypto.verify('sha256', Buffer.from(h + '.' + p), pub, Buffer.from(s, 'base64url'));
  if (!okSig) throw new Error('bad signature');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (iss && claims.iss !== iss) throw new Error('bad issuer');
  if (aud && claims.aud !== aud) throw new Error('bad audience');
  if (claims.exp && Date.now() / 1000 > claims.exp) throw new Error('token expired');
  return claims;
}
async function appleExchange(code, redirectUri, userField) {
  const tr = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.APPLE_CLIENT_ID, client_secret: appleClientSecret(), redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  if (!tr.ok) throw new Error('apple token exchange failed: ' + tr.status);
  const tok = await tr.json();
  const claims = await verifyJwtRS256(tok.id_token, 'https://appleid.apple.com/auth/keys', { iss: 'https://appleid.apple.com', aud: process.env.APPLE_CLIENT_ID });
  // Apple sends the name only on first consent, as a JSON string in `user`.
  let name = '';
  try { const u = userField ? JSON.parse(userField) : null; if (u && u.name) name = [u.name.firstName, u.name.lastName].filter(Boolean).join(' '); } catch {}
  return { provider: 'apple', sub: claims.sub, email: String(claims.email || '').toLowerCase(), emailVerified: claims.email_verified !== false && claims.email_verified !== 'false', name };
}

module.exports = {
  providers, googleAuthUrl, googleExchange, appleAuthUrl, appleExchange, appleClientSecret, verifyJwtRS256,
};
