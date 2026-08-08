'use strict';
/* Self-contained Web Push — VAPID (RFC 8292) + payload encryption aes128gcm (RFC 8291 / RFC 8188).
   Uses only node:crypto + node:https. No external dependencies. */
const crypto = require('crypto');
const https = require('https');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// generate a VAPID keypair (P-256). publicKey is the 65-byte uncompressed point, both base64url.
function generateVapidKeys() {
  const dh = crypto.createECDH('prime256v1');
  dh.generateKeys();
  return { publicKey: b64url(dh.getPublicKey()), privateKey: b64url(dh.getPrivateKey()) };
}

function vapidPrivKeyObject(privB64, pubB64) {
  const pub = unb64url(pubB64); // 0x04 || X(32) || Y(32)
  const jwk = { kty: 'EC', crv: 'P-256', d: b64url(unb64url(privB64)), x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) };
  return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
}

// Authorization header for a push endpoint (VAPID, ES256 JWT)
function vapidAuth(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const signingInput = header + '.' + claims;
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: vapidPrivKeyObject(vapid.privateKey, vapid.publicKey), dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + signingInput + '.' + b64url(sig) + ', k=' + vapid.publicKey;
}

const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

// Encrypt a payload for a subscription. Returns the aes128gcm body Buffer.
function encrypt(plaintext, uaPublicB64, authSecretB64, asDh, saltIn) {
  const uaPublic = unb64url(uaPublicB64);       // 65 bytes
  const authSecret = unb64url(authSecretB64);   // 16 bytes
  asDh = asDh || crypto.createECDH('prime256v1');
  if (!asDh._gen) { asDh.generateKeys(); }
  const asPublic = asDh.getPublicKey();         // 65 bytes
  const ecdhSecret = asDh.computeSecret(uaPublic); // 32 bytes
  const salt = saltIn || crypto.randomBytes(16);
  // RFC 8291 §3.4: IKM
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  // RFC 8188: content-encryption key + nonce
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  // single record: plaintext || 0x02 (last-record padding delimiter)
  const record = Buffer.concat([Buffer.from(plaintext), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);   // record size
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, ct]);
}

// Decrypt (for self-test only): recover plaintext with the UA private ECDH.
function decrypt(body, uaDh, authSecretB64) {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const uaPublic = uaDh.getPublicKey();
  const ecdhSecret = uaDh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(unb64url(authSecretB64), ecdhSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const tag = ct.subarray(ct.length - 16);
  const data = ct.subarray(0, ct.length - 16);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  // strip trailing padding delimiter
  let end = out.length;
  while (end > 0 && out[end - 1] === 0) end--;
  return out.subarray(0, end - 1).toString();
}

// POST the encrypted payload to the push service. Resolves { ok, status, gone }.
function sendNotification(subscription, payloadObj, vapid, subject) {
  return new Promise((resolve) => {
    let body;
    try { body = encrypt(JSON.stringify(payloadObj), subscription.keys.p256dh, subscription.keys.auth); }
    catch (e) { return resolve({ ok: false, status: 0, error: 'encrypt:' + e.message }); }
    let u; try { u = new URL(subscription.endpoint); } catch (e) { return resolve({ ok: false, status: 0, gone: true }); }
    const headers = {
      Authorization: vapidAuth(subscription.endpoint, vapid, subject),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: '2419200', 'Content-Length': body.length,
    };
    const req = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'POST', headers }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, gone: res.statusCode === 404 || res.statusCode === 410, body: d }));
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
    req.write(body); req.end();
  });
}

module.exports = { generateVapidKeys, sendNotification, encrypt, decrypt, b64url, unb64url };
