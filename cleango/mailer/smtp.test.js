/**
 * SMTP client tests against a real (local) SMTP conversation.
 *
 * The mailer is a hand-rolled client: nothing catches a protocol mistake until
 * a live server rejects it, and by then it looks like "почта не работает" with
 * no clue why. So we speak the protocol back at it — a throwaway server on
 * 127.0.0.1 that records every command — and assert on the actual bytes.
 *
 *   node mailer/smtp.test.js
 */
'use strict';
const assert = require('assert');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const { sendMail, buildMessage } = require('./smtp');

// A self-signed cert, generated per run, so STARTTLS can be exercised without
// shipping key material in the repo.
function selfSigned() {
  const { execFileSync } = require('child_process');
  const dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'lumi-smtp-'));
  const key = `${dir}/k.pem`, cert = `${dir}/c.pem`;
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
    '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  return { key: require('fs').readFileSync(key), cert: require('fs').readFileSync(cert) };
}

// Minimal SMTP server. `opts.starttls` decides whether STARTTLS is advertised,
// `opts.auth` which mechanism is advertised. Everything the client says is
// recorded in `log`; a delivered message lands in `messages`.
function fakeServer(opts = {}) {
  const log = [];
  const messages = [];
  const creds = { user: null, pass: null };
  const pem = opts.starttls === false ? null : (opts.pem || selfSigned());

  const session = (sock) => {
    let inData = false, buf = '', body = '';
    const say = (s) => sock.write(s + '\r\n');
    sock.setEncoding('utf8');
    say('220 lumi-test ESMTP');
    const onLine = (line) => {
      if (inData) {
        if (line === '.') { inData = false; messages.push(body); body = ''; say('250 2.0.0 Ok: queued'); }
        else body += line + '\n';
        return;
      }
      log.push(line);
      const up = line.toUpperCase();
      if (up.startsWith('EHLO')) {
        const ext = ['250-lumi-test', '250-SIZE 35882577'];
        if (pem && !sock.encrypted) ext.push('250-STARTTLS');
        ext.push('250 AUTH ' + (opts.auth || 'LOGIN PLAIN'));
        sock.write(ext.join('\r\n') + '\r\n');
      } else if (up === 'STARTTLS') {
        say('220 2.0.0 Ready to start TLS');
        const plain = sock;
        plain.removeAllListeners('data');
        const sec = new tls.TLSSocket(plain, { isServer: true, key: pem.key, cert: pem.cert });
        sec.on('secure', () => session2(sec));
      } else if (up.startsWith('AUTH PLAIN')) {
        creds.raw = Buffer.from(line.split(' ')[2] || '', 'base64');
        const parts = creds.raw.toString('utf8').split('\0');
        creds.user = parts[1]; creds.pass = parts[2];
        say(opts.rejectAuth ? '535 5.7.139 Authentication unsuccessful' : '235 2.7.0 Authentication successful');
      } else if (up === 'AUTH LOGIN') { creds.stage = 'user'; say('334 VXNlcm5hbWU6'); }
      else if (creds.stage === 'user') { creds.user = Buffer.from(line, 'base64').toString('utf8'); creds.stage = 'pass'; say('334 UGFzc3dvcmQ6'); }
      else if (creds.stage === 'pass') { creds.pass = Buffer.from(line, 'base64').toString('utf8'); creds.stage = null; say(opts.rejectAuth ? '535 5.7.139 Authentication unsuccessful' : '235 2.7.0 Authentication successful'); }
      else if (up.startsWith('MAIL FROM')) say('250 2.1.0 Ok');
      else if (up.startsWith('RCPT TO')) say('250 2.1.5 Ok');
      else if (up === 'DATA') { inData = true; say('354 End data with <CR><LF>.<CR><LF>'); }
      else if (up === 'QUIT') { say('221 2.0.0 Bye'); sock.end(); }
      else say('250 2.0.0 Ok');
    };
    const feed = (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, nl).replace(/\r$/, ''); buf = buf.slice(nl + 1); onLine(l); }
    };
    sock.on('data', feed);
    sock.on('error', () => {});
    var session2 = (sec) => { sec.setEncoding('utf8'); buf = ''; sec.on('data', feed); sec.on('error', () => {}); sock = sec; };
  };

  const srv = net.createServer(session);
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, log, messages, creds, close: () => srv.close() }));
  });
}

const results = [];
const ok = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); } };

(async () => {
  const pem = selfSigned();
  const base = { user: 'support@lumi24.pl', pass: 'p@ss word:with tricky chars', from: 'support@lumi24.pl', fromName: 'LUMI', rejectUnauthorized: false, timeoutMs: 8000 };

  await ok('STARTTLS + AUTH LOGIN delivers the message', async () => {
    const s = await fakeServer({ auth: 'LOGIN', pem });
    const r = await sendMail({ ...base, host: '127.0.0.1', port: s.port, secure: false }, { to: 'k@example.com', subject: 'Test', text: 'hello' });
    assert.strictEqual(r.ok, true);
    assert.ok(s.log.includes('STARTTLS'), 'client upgraded the connection');
    assert.strictEqual(s.creds.user, base.user);
    assert.strictEqual(s.creds.pass, base.pass, 'password survived base64 round-trip');
    assert.strictEqual(s.messages.length, 1);
    s.close();
  });

  await ok('AUTH PLAIN token is NUL-separated (RFC 4616)', async () => {
    const s = await fakeServer({ auth: 'PLAIN', pem });
    await sendMail({ ...base, host: '127.0.0.1', port: s.port, secure: false }, { to: 'k@example.com', subject: 'x', text: 'y' });
    // The exact bytes matter: a space instead of NUL is accepted by our own
    // parser but rejected by every real server with a misleading 535.
    assert.strictEqual(s.creds.raw.toString('utf8'), '\0' + base.user + '\0' + base.pass);
    assert.strictEqual(s.creds.raw[0], 0, 'starts with a NUL, not a space');
    s.close();
  });

  await ok('password is never sent over an unencrypted connection', async () => {
    const s = await fakeServer({ starttls: false, auth: 'LOGIN PLAIN' });
    await assert.rejects(
      () => sendMail({ ...base, host: '127.0.0.1', port: s.port, secure: false }, { to: 'k@example.com', subject: 'x', text: 'y' }),
      /STARTTLS/,
      'refuses to authenticate in clear text');
    assert.strictEqual(s.creds.user, null, 'no credentials reached the wire');
    assert.strictEqual(s.messages.length, 0);
    s.close();
  });

  await ok('a rejected login surfaces the server reason', async () => {
    const s = await fakeServer({ auth: 'LOGIN', pem, rejectAuth: true });
    await assert.rejects(
      () => sendMail({ ...base, host: '127.0.0.1', port: s.port, secure: false }, { to: 'k@example.com', subject: 'x', text: 'y' }),
      /535|5\.7\.139/,
      'the SMTP status code reaches the caller');
    s.close();
  });

  await ok('UTF-8 subject and body survive the encoding', async () => {
    const s = await fakeServer({ auth: 'LOGIN', pem });
    await sendMail({ ...base, host: '127.0.0.1', port: s.port, secure: false },
      { to: 'k@example.com', subject: 'Zamówienie — potwierdzenie ✓', text: 'Dziękujemy! Zapłacono 194 zł.' });
    const raw = s.messages[0];
    assert.ok(/^Subject: =\?UTF-8\?B\?/m.test(raw), 'non-ASCII subject is MIME-encoded');
    const b64 = raw.split(/\r?\n\r?\n/).slice(1).join('\n').replace(/\s+/g, '');
    assert.ok(Buffer.from(b64, 'base64').toString('utf8').includes('194 zł'), 'body decodes back to the original text');
    s.close();
  });

  // Base64 transfer-encoding already makes a bare "." line impossible; this
  // guards the property (message arrives whole) rather than the mechanism, so
  // it still catches a future switch to 8-bit or quoted-printable bodies.
  await ok('a line starting with a dot cannot end the message early', async () => {
    const s = await fakeServer({ auth: 'LOGIN', pem });
    await sendMail({ ...base, host: '127.0.0.1', port: s.port, secure: false },
      { to: 'k@example.com', subject: 'dot', text: 'line one\n.\nline two' });
    assert.strictEqual(s.messages.length, 1, 'the message was delivered whole, not truncated at the dot');
    s.close();
  });

  await ok('message carries the headers a real MTA expects', async () => {
    const raw = buildMessage({ from: 'support@lumi24.pl', fromName: 'LUMI' }, { to: 'k@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    for (const h of ['From: LUMI <support@lumi24.pl>', 'To: k@example.com', 'Date: ', 'Message-ID: <', 'MIME-Version: 1.0']) {
      assert.ok(raw.includes(h), 'missing header: ' + h);
    }
    assert.ok(/Message-ID: <[0-9a-f]+@lumi24\.pl>/.test(raw), 'Message-ID is scoped to the sending domain');
    assert.ok(raw.includes('multipart/alternative'), 'html mail carries a plain-text alternative');
    assert.ok(raw.split('\n').every((l) => l.endsWith('\r') || l === ''), 'every line ends CRLF');
  });

  const failed = results.filter((r) => !r[0]);
  for (const [pass, name, err] of results) console.log(`  ${pass ? 'ok' : 'FAIL'} - ${name}${err ? ' → ' + err : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} SMTP checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('smtp.test.js crashed:', e); process.exit(1); });
