/**
 * Backup tests: the crypto and the request signing, checked against something
 * external rather than against themselves.
 *
 * Both halves fail silently in the worst way. A signature bug means every
 * upload 403s and the timer keeps "succeeding" if nobody looks; an encryption
 * bug means the archives exist and cannot be opened on the day they are needed.
 */
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { signV4, encryptFile, decryptFile } = require('./backup');

const results = [];
const ok = (name, fn) => { try { fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); } };
const tmp = (n) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-bk-')), n);

// AWS's own published SigV4 example ("GET Object", Signature Version 4 test
// suite). If our signer drifts from the spec this vector stops matching.
ok('SigV4 matches the published AWS example', () => {
  const r = signV4({
    method: 'GET',
    host: 'examplebucket.s3.amazonaws.com',
    pathname: '/test.txt',
    query: '',
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    region: 'us-east-1',
    service: 's3',
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    date: new Date(Date.UTC(2013, 4, 24, 0, 0, 0)),
    extraHeaders: { range: 'bytes=0-9' },
  });
  assert.strictEqual(r.signature, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

ok('signed headers are sorted and lower-cased, as S3 requires', () => {
  const r = signV4({
    method: 'PUT', host: 'h.example', pathname: '/b/k', payloadHash: 'abc',
    region: 'eu', accessKey: 'A', secretKey: 'S', date: new Date(0),
    extraHeaders: { 'Content-Length': '10' },
  });
  const line = r.canonicalRequest.split('\n').slice(-2, -1)[0];
  assert.strictEqual(line, 'content-length;host;x-amz-content-sha256;x-amz-date');
});

ok('a backup round-trips through encryption byte for byte', () => {
  process.env.LUMI_BACKUP_KEY = 'a-long-enough-passphrase-for-a-test';
  const src = tmp('plain.bin');
  // Bigger than the 1 MiB chunk so the streaming path is actually exercised.
  const payload = crypto.randomBytes(3 * 1024 * 1024 + 12345);
  fs.writeFileSync(src, payload);
  const enc = src + '.enc';
  const out = src + '.out';
  encryptFile(src, enc);
  assert.ok(!fs.readFileSync(enc).includes(payload.subarray(0, 64)), 'the ciphertext does not contain the plaintext');
  decryptFile(enc, out);
  assert.ok(fs.readFileSync(out).equals(payload), 'decrypted output is identical');
});

ok('the wrong key cannot open a backup', () => {
  process.env.LUMI_BACKUP_KEY = 'the-right-passphrase';
  const src = tmp('p.bin');
  fs.writeFileSync(src, Buffer.from('kyc: pesel, id photo, iban'));
  encryptFile(src, src + '.enc');
  process.env.LUMI_BACKUP_KEY = 'a-different-passphrase';
  assert.throws(() => decryptFile(src + '.enc', src + '.out'), /unable to authenticate|bad decrypt|auth/i);
});

ok('a tampered backup is rejected rather than restored', () => {
  process.env.LUMI_BACKUP_KEY = 'k'.repeat(64);          // hex-form key path
  const src = tmp('t.bin');
  fs.writeFileSync(src, Buffer.alloc(4096, 7));
  const enc = src + '.enc';
  encryptFile(src, enc);
  const buf = fs.readFileSync(enc);
  buf[buf.length - 40] ^= 0xff;                          // flip a bit in the ciphertext
  fs.writeFileSync(enc, buf);
  assert.throws(() => decryptFile(enc, src + '.out'), /unable to authenticate|auth/i);
});

ok('a file that is not a LUMI archive is refused by name, not by crash', () => {
  process.env.LUMI_BACKUP_KEY = 'x'.repeat(64);
  const f = tmp('random.bin');
  fs.writeFileSync(f, crypto.randomBytes(1024));
  assert.throws(() => decryptFile(f, f + '.out'), /не архив LUMI/);
});


// ── the setup wizard: it must never write half a configuration ──
const setup = require('./backup-setup');

ok('leftovers from the instructions are refused as values', () => {
  for (const v of ['твой_keyID', 'вставь_сюда_64_символа', '<длинная фраза>', '', 'your-key-here', '...']) {
    assert.strictEqual(setup.looksLikePlaceholder(v), true, `должно быть отвергнуто: ${v}`);
  }
  for (const v of ['s3.eu-central-003.backblazeb2.com', '005a1b2c3d4e5f60000000001', 'K005AbCdEf/12345+xyz', 'a'.repeat(64)]) {
    assert.strictEqual(setup.looksLikePlaceholder(v), false, `должно быть принято: ${v}`);
  }
});

ok('writing the config keeps the other secrets and locks the file down', () => {
  const f = tmp('instance.local.env');
  fs.writeFileSync(f, 'LUMI_SMTP_PASS=my p@ss word\nLUMI_BACKUP_S3_BUCKET=old-bucket\n');
  setup.writeEnv(f, {
    LUMI_BACKUP_KEY: 'f'.repeat(64), LUMI_BACKUP_S3_ENDPOINT: 's3.example.com',
    LUMI_BACKUP_S3_BUCKET: 'new-bucket', LUMI_BACKUP_S3_REGION: 'eu-1',
    LUMI_BACKUP_S3_KEY: 'kid', LUMI_BACKUP_S3_SECRET: 'sec',
  });
  const out = fs.readFileSync(f, 'utf8');
  assert.ok(out.includes('LUMI_SMTP_PASS=my p@ss word'), 'unrelated secrets survive');
  assert.strictEqual((out.match(/LUMI_BACKUP_S3_BUCKET=/g) || []).length, 1, 'the old value is replaced, not duplicated');
  assert.ok(out.includes('LUMI_BACKUP_S3_BUCKET=new-bucket'));
  assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600, 'file is not world-readable');
});


ok('a pasted command or config line is refused at the prompt, not at the end', () => {
  const F = setup.FIELD;
  // Exactly what landed in the prompts when the clipboard still held the
  // instructions: a whole assignment, and the command that started the wizard.
  assert.strictEqual(F.endpoint.ok('LUMI_BACKUP_S3_KEY=abc123'), false);
  assert.strictEqual(F.bucket.ok('cd /opt/lumi && bash deploy/auto-update.sh'), false);
  assert.strictEqual(F.keyID.ok('LUMI_BACKUP_S3_KEY=005abc'), false);
  assert.strictEqual(F.appKey.ok('two words'), false);
  // …while the real values pass.
  assert.strictEqual(F.endpoint.ok('s3.eu-central-003.backblazeb2.com'), true);
  assert.strictEqual(F.bucket.ok('lumi-backups'), true);
  assert.strictEqual(F.region.ok('eu-central-003'), true);
  assert.strictEqual(F.keyID.ok('005a1b2c3d4e5f60000000001'), true);
  assert.strictEqual(F.appKey.ok('K005AbCdEf/12345+xyz'), true);
});

const failed = results.filter((r) => !r[0]);
for (const [pass, name, err] of results) console.log(`  ${pass ? 'ok' : 'FAIL'} - ${name}${err ? ' → ' + err : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} backup checks passed.`);
process.exit(failed.length ? 1 : 0);
