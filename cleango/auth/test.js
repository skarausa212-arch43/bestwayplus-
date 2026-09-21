'use strict';
// Unit coverage for the social sign-in module (auth/oauth.js): provider
// detection, authorize-URL shape, the Apple ES256 client secret, and the
// RS256 id_token verification path (with a mocked JWKS).
const assert = require('assert');
const crypto = require('crypto');

// Clean slate, then load the module.
for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']) delete process.env[k];
const oauth = require('./oauth');

// providers() reflects env presence
assert.deepEqual(oauth.providers(), { google: false, apple: false });
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec';
assert.equal(oauth.providers().google, true);
console.log('\n  ok - providers() toggles with env config');

// Google authorize URL
const gu = new URL(oauth.googleAuthUrl('https://lumi.test/api/auth/google/callback', 'st8'));
assert.equal(gu.origin + gu.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
assert.equal(gu.searchParams.get('client_id'), 'cid');
assert.equal(gu.searchParams.get('redirect_uri'), 'https://lumi.test/api/auth/google/callback');
assert.equal(gu.searchParams.get('state'), 'st8');
assert.equal(gu.searchParams.get('response_type'), 'code');
assert.ok(gu.searchParams.get('scope').includes('email'));
console.log('  ok - googleAuthUrl carries client_id, redirect, scope, state');

// Apple authorize URL uses form_post
process.env.APPLE_CLIENT_ID = 'pl.bestwayplus.lumi.web';
const au = new URL(oauth.appleAuthUrl('https://lumi.test/api/auth/apple/callback', 'sx'));
assert.equal(au.origin + au.pathname, 'https://appleid.apple.com/auth/authorize');
assert.equal(au.searchParams.get('response_mode'), 'form_post');
assert.equal(au.searchParams.get('client_id'), 'pl.bestwayplus.lumi.web');
console.log('  ok - appleAuthUrl requests response_mode=form_post');

// Apple client secret is a valid ES256 JWT signed by the .p8 key
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.APPLE_TEAM_ID = 'TEAM123'; process.env.APPLE_KEY_ID = 'KEY123';
process.env.APPLE_PRIVATE_KEY = ec.privateKey.export({ type: 'pkcs8', format: 'pem' });
assert.equal(oauth.providers().apple, true);
const cs = oauth.appleClientSecret().split('.');
assert.equal(cs.length, 3);
const hdr = JSON.parse(Buffer.from(cs[0], 'base64url'));
const pl = JSON.parse(Buffer.from(cs[1], 'base64url'));
assert.equal(hdr.alg, 'ES256'); assert.equal(hdr.kid, 'KEY123');
assert.equal(pl.iss, 'TEAM123'); assert.equal(pl.sub, 'pl.bestwayplus.lumi.web'); assert.equal(pl.aud, 'https://appleid.apple.com');
assert.ok(crypto.verify('sha256', Buffer.from(cs[0] + '.' + cs[1]), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(cs[2], 'base64url')), 'signature verifies');
console.log('  ok - appleClientSecret is a verifiable ES256 JWT with correct claims');

// verifyJwtRS256 against a mocked JWKS: accepts a good token, rejects a tampered one
(async () => {
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = rsa.publicKey.export({ format: 'jwk' }); jwk.kid = 'k1'; jwk.alg = 'RS256'; jwk.use = 'sig';
  const header = { alg: 'RS256', kid: 'k1', typ: 'JWT' };
  const claims = { iss: 'https://appleid.apple.com', aud: 'pl.bestwayplus.lumi.web', sub: '000123', email: 'user@icloud.com', email_verified: 'true', exp: Math.floor(Date.now() / 1000) + 600 };
  const si = Buffer.from(JSON.stringify(header)).toString('base64url') + '.' + Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(si), rsa.privateKey).toString('base64url');
  const orig = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  const out = await oauth.verifyJwtRS256(si + '.' + sig, 'https://appleid.apple.com/auth/keys', { iss: 'https://appleid.apple.com', aud: 'pl.bestwayplus.lumi.web' });
  assert.equal(out.sub, '000123'); assert.equal(out.email, 'user@icloud.com');
  let rejected = false;
  try { await oauth.verifyJwtRS256(si + '.' + sig.slice(0, -6) + 'AAAAAA', 'https://appleid.apple.com/auth/keys', { iss: 'https://appleid.apple.com', aud: 'pl.bestwayplus.lumi.web' }); }
  catch { rejected = true; }
  assert.ok(rejected, 'tampered signature rejected');
  global.fetch = orig;
  console.log('  ok - verifyJwtRS256 accepts valid id_token and rejects tampering');
  console.log('\n6 oauth checks passed.');
})().catch((e) => { console.error(e); process.exit(1); });
