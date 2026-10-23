/**
 * Scheduled, encrypted, off-site backups of the LUMI data directory.
 *
 *   node ops/backup.js run                  # snapshot → encrypt → upload → verify → prune
 *   node ops/backup.js decrypt <file.enc> [out.tgz]
 *   node ops/backup.js list                 # what is in the bucket
 *   node ops/backup.js status               # last backup, age, size — for monitoring
 *
 * Three things make this a backup rather than theatre:
 *
 *   • it leaves the machine. A .tgz next to the data it protects is not a
 *     backup — the VPS dying takes both.
 *   • it is encrypted before it leaves. The archive carries KYC material: ID
 *     photos, PESEL, bank details. Handing that to a third-party bucket in the
 *     clear is a personal-data breach waiting for a misconfigured ACL.
 *   • it is verified by reading it back and decrypting it. A backup nobody has
 *     ever restored is a guess.
 *
 * Config (deploy/instance.local.env):
 *   LUMI_BACKUP_KEY        passphrase or 64-hex-char key. NO KEY = NO RESTORE:
 *                          keep a copy somewhere that is not this server.
 *   LUMI_BACKUP_S3_ENDPOINT  e.g. s3.eu-central-003.backblazeb2.com
 *   LUMI_BACKUP_S3_BUCKET    bucket name
 *   LUMI_BACKUP_S3_REGION    e.g. eu-central-003
 *   LUMI_BACKUP_S3_KEY / _SECRET
 *   LUMI_BACKUP_KEEP_DAYS    retention, default 30
 * Works with any S3-compatible storage (Backblaze B2, Wasabi, Hetzner, R2, AWS).
 * Without the S3 block it still snapshots and encrypts locally, and says so.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { loadInstanceEnv } = require('../deploy/render-env-dropin');
const APP_DIR = process.env.LUMI_APP_DIR || '/opt/lumi';
loadInstanceEnv([path.join(APP_DIR, 'deploy'), path.join(ROOT, 'deploy')]);

const DATA_DIR = process.env.LUMI_DATA_DIR || path.join(APP_DIR, 'data');
const LOCAL_DIR = process.env.LUMI_BACKUP_DIR || '/var/backups/lumi';
const KEEP_DAYS = Number(process.env.LUMI_BACKUP_KEEP_DAYS || 30);
const KEEP_LOCAL = Number(process.env.LUMI_BACKUP_KEEP_LOCAL || 3);
const MAGIC = Buffer.from('LUMIBK1\0');

const s3cfg = () => ({
  endpoint: (process.env.LUMI_BACKUP_S3_ENDPOINT || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
  bucket: (process.env.LUMI_BACKUP_S3_BUCKET || '').trim(),
  region: (process.env.LUMI_BACKUP_S3_REGION || 'us-east-1').trim(),
  key: (process.env.LUMI_BACKUP_S3_KEY || '').trim(),
  secret: (process.env.LUMI_BACKUP_S3_SECRET || '').trim(),
  prefix: (process.env.LUMI_BACKUP_S3_PREFIX || 'lumi').replace(/^\/+|\/+$/g, ''),
});
const s3Ready = () => { const c = s3cfg(); return !!(c.endpoint && c.bucket && c.key && c.secret); };

// ── encryption ─────────────────────────────────────────────────────────────
// AES-256-GCM. Layout: MAGIC | salt(16) | iv(12) | ciphertext | tag(16).
// The key is derived with scrypt so a human-typed passphrase is usable.
function deriveKey(salt) {
  const raw = process.env.LUMI_BACKUP_KEY || '';
  if (!raw) throw new Error('LUMI_BACKUP_KEY не задан — шифровать нечем, а без шифрования выгружать KYC наружу нельзя');
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.scryptSync(raw, salt, 32);
}
function encryptFile(src, dst) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(salt), iv);
  const out = fs.openSync(dst, 'w');
  fs.writeSync(out, Buffer.concat([MAGIC, salt, iv]));
  const inp = fs.openSync(src, 'r');
  const buf = Buffer.alloc(1 << 20);
  for (;;) {
    const n = fs.readSync(inp, buf, 0, buf.length, null);
    if (n <= 0) break;
    fs.writeSync(out, cipher.update(buf.subarray(0, n)));
  }
  fs.closeSync(inp);
  fs.writeSync(out, cipher.final());
  fs.writeSync(out, cipher.getAuthTag());
  fs.closeSync(out);
}
function decryptFile(src, dst) {
  const size = fs.statSync(src).size;
  const head = MAGIC.length + 16 + 12;
  if (size < head + 16) throw new Error('файл слишком мал — это не архив LUMI');
  const fd = fs.openSync(src, 'r');
  const header = Buffer.alloc(head);
  fs.readSync(fd, header, 0, head, 0);
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) { fs.closeSync(fd); throw new Error('не архив LUMI (нет заголовка)'); }
  const salt = header.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = header.subarray(MAGIC.length + 16, head);
  const tag = Buffer.alloc(16);
  fs.readSync(fd, tag, 0, 16, size - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(salt), iv);
  decipher.setAuthTag(tag);
  const out = fs.openSync(dst, 'w');
  let pos = head;
  const end = size - 16;
  const buf = Buffer.alloc(1 << 20);
  while (pos < end) {
    const n = fs.readSync(fd, buf, 0, Math.min(buf.length, end - pos), pos);
    if (n <= 0) break;
    pos += n;
    fs.writeSync(out, decipher.update(buf.subarray(0, n)));
  }
  fs.closeSync(fd);
  // final() throws if the tag does not match — i.e. wrong key or tampered file.
  fs.writeSync(out, decipher.final());
  fs.closeSync(out);
}

// ── S3 (SigV4, no SDK) ─────────────────────────────────────────────────────
const sha256hex = (x) => crypto.createHash('sha256').update(x).digest('hex');
const hmac = (k, x) => crypto.createHmac('sha256', k).update(x).digest();
function fileSha256(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 20);
  for (;;) { const n = fs.readSync(fd, buf, 0, buf.length, null); if (n <= 0) break; h.update(buf.subarray(0, n)); }
  fs.closeSync(fd);
  return h.digest('hex');
}
// Signature Version 4 for S3. Exported so it can be checked against AWS's own
// published test vector rather than "it seemed to work".
function signV4({ method, host, pathname, query = '', payloadHash, region, service = 's3', accessKey, secretKey, date = new Date(), extraHeaders = {} }) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...extraHeaders };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === n)]).trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, pathname, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kDate = hmac('AWS4' + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    headers: { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
    signature, canonicalRequest, stringToSign,
  };
}
function s3Request({ method, key, query = '', bodyFile = null, payloadHash }) {
  const c = s3cfg();
  const pathname = '/' + [c.bucket, key].filter(Boolean).join('/').split('/').map(encodeURIComponent).join('/');
  const size = bodyFile ? fs.statSync(bodyFile).size : 0;
  const signed = signV4({
    method, host: c.endpoint, pathname, query, payloadHash,
    region: c.region, accessKey: c.key, secretKey: c.secret,
    extraHeaders: bodyFile ? { 'content-length': String(size) } : {},
  });
  return new Promise((resolve, reject) => {
    const req = https.request({ host: c.endpoint, path: pathname + (query ? '?' + query : ''), method, headers: signed.headers, timeout: 120000 }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('S3 timeout')); });
    if (bodyFile) fs.createReadStream(bodyFile).pipe(req); else req.end();
  });
}
const s3Put = (key, file) => s3Request({ method: 'PUT', key, bodyFile: file, payloadHash: fileSha256(file) });
const s3Get = (key) => s3Request({ method: 'GET', key, payloadHash: sha256hex('') });
const s3Delete = (key) => s3Request({ method: 'DELETE', key, payloadHash: sha256hex('') });
async function s3List(prefix) {
  const c = s3cfg();
  const query = `list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const r = await s3Request({ method: 'GET', key: '', query, payloadHash: sha256hex('') });
  if (r.status !== 200) return { status: r.status, keys: [] };
  const xml = r.body.toString('utf8');
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  return { status: 200, keys };
}

// ── the job ────────────────────────────────────────────────────────────────
const log = (msg, extra) => console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const STATE = path.join(LOCAL_DIR, 'last-backup.json');

async function run() {
  if (!fs.existsSync(DATA_DIR)) { console.error(`✗ нет каталога данных ${DATA_DIR}`); process.exit(1); }
  fs.mkdirSync(LOCAL_DIR, { recursive: true, mode: 0o700 });
  const name = `lumi-${stamp()}`;
  const tgz = path.join(LOCAL_DIR, `${name}.tgz`);
  const enc = `${tgz}.enc`;

  // Snapshot without stopping the service: writes are atomic renames now, so a
  // file is never captured half-written.
  execFileSync('tar', ['czf', tgz, '-C', path.dirname(DATA_DIR), path.basename(DATA_DIR)], { stdio: 'inherit' });
  const rawSize = fs.statSync(tgz).size;
  encryptFile(tgz, enc);
  fs.unlinkSync(tgz);                                        // never leave the plaintext around
  const encSize = fs.statSync(enc).size;
  log('snapshot created', { file: path.basename(enc), rawSize, encSize });

  // Verify locally first: decrypt and let tar prove the archive is readable.
  const check = path.join(os.tmpdir(), `${name}-verify.tgz`);
  decryptFile(enc, check);
  const listing = execFileSync('tar', ['tzf', check], { encoding: 'utf8' });
  fs.unlinkSync(check);
  if (!/users\.json/.test(listing)) throw new Error('в архиве нет users.json — снимок неполный');
  log('verified locally', { entries: listing.trim().split('\n').length });

  let remoteKey = null;
  if (s3Ready()) {
    const c = s3cfg();
    remoteKey = `${c.prefix}/${path.basename(enc)}`;
    const put = await s3Put(remoteKey, enc);
    if (put.status !== 200) throw new Error(`выгрузка не удалась: HTTP ${put.status} ${put.body.toString('utf8').slice(0, 200)}`);
    // Read it back — the only proof the bytes are really there and decryptable.
    const got = await s3Get(remoteKey);
    if (got.status !== 200) throw new Error(`архив не читается обратно: HTTP ${got.status}`);
    const back = path.join(os.tmpdir(), `${name}-remote.enc`);
    fs.writeFileSync(back, got.body);
    const out = path.join(os.tmpdir(), `${name}-remote.tgz`);
    decryptFile(back, out);
    execFileSync('tar', ['tzf', out], { stdio: 'ignore' });
    fs.unlinkSync(back); fs.unlinkSync(out);
    log('uploaded and verified off-site', { key: remoteKey, bytes: got.body.length });

    // Retention: drop remote copies older than the window.
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    const { keys } = await s3List(c.prefix + '/');
    for (const k of keys) {
      const m = k.match(/lumi-(\d{4}-\d{2}-\d{2})T/);
      if (!m) continue;
      if (new Date(m[1]).getTime() < cutoff) { await s3Delete(k); log('pruned remote', { key: k }); }
    }
  } else {
    log('WARNING: off-site storage is not configured — the copy stays on this server', { hint: 'LUMI_BACKUP_S3_*' });
  }

  // Local retention: a few generations for a fast restore, no more.
  const locals = fs.readdirSync(LOCAL_DIR).filter((f) => f.endsWith('.tgz.enc')).sort().reverse();
  for (const f of locals.slice(KEEP_LOCAL)) { fs.unlinkSync(path.join(LOCAL_DIR, f)); log('pruned local', { file: f }); }

  fs.writeFileSync(STATE, JSON.stringify({ at: Date.now(), file: path.basename(enc), encSize, rawSize, remoteKey }, null, 2));
  console.log(`\n✓ бэкап готов: ${enc}${remoteKey ? ` → ${remoteKey}` : ' (только локально)'}`);
}

function status() {
  let st = null;
  try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
  if (!st) { console.log('✗ бэкапов ещё не было'); process.exit(1); }
  const ageH = (Date.now() - st.at) / 3600000;
  console.log(`последний бэкап: ${new Date(st.at).toISOString()} (${ageH.toFixed(1)} ч назад)`);
  console.log(`файл: ${st.file} · ${(st.encSize / 1048576).toFixed(1)} МБ${st.remoteKey ? ` · вне сервера: ${st.remoteKey}` : ' · ТОЛЬКО локально'}`);
  if (ageH > 48) { console.log('✗ бэкап старше 48 часов — таймер не работает'); process.exit(1); }
  if (!st.remoteKey) { console.log('! копии вне сервера нет'); process.exit(1); }
  console.log('🟢 ок');
}

// Importable for tests; the CLI only runs when invoked directly.
if (require.main === module) (async () => {
  const cmd = process.argv[2] || 'run';
  try {
    if (cmd === 'run') await run();
    else if (cmd === 'status') status();
    else if (cmd === 'decrypt') {
      const src = process.argv[3];
      if (!src) { console.log('usage: node ops/backup.js decrypt <file.enc> [out.tgz]'); process.exit(1); }
      const dst = process.argv[4] || src.replace(/\.enc$/, '');
      decryptFile(src, dst);
      console.log(`✓ расшифровано → ${dst}\n  дальше:  bash deploy/restore-data.sh ${dst}`);
    } else if (cmd === 'list') {
      if (!s3Ready()) { console.log('S3 не настроен'); process.exit(1); }
      const { keys } = await s3List(s3cfg().prefix + '/');
      keys.forEach((k) => console.log(' ', k));
      console.log(`${keys.length} архив(ов)`);
    } else { console.log('usage: node ops/backup.js [run|status|decrypt <file>|list]'); process.exit(1); }
  } catch (e) {
    console.error(JSON.stringify({ at: new Date().toISOString(), level: 'error', msg: 'backup failed', err: String(e.message || e) }));
    process.exit(1);
  }
})();

module.exports = { signV4, encryptFile, decryptFile, deriveKey };
