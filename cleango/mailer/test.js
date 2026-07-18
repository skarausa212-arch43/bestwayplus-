/**
 * Self-checks for the zero-dependency SMTP client + email templates.
 *   node mailer/test.js
 * Spins up a tiny in-process fake SMTP server and verifies the client speaks
 * the protocol (EHLO → AUTH LOGIN → MAIL/RCPT/DATA) and delivers the message.
 */
'use strict';
const assert = require('assert');
const net = require('net');
const { sendMail, buildMessage } = require('./smtp');
const mailer = require('./index');

let n = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log('  ok -', name); });

// A minimal SMTP server that records the conversation.
function fakeServer() {
  const captured = { from: '', rcpt: '', data: '', user: '', pass: '' };
  const server = net.createServer((sock) => {
    sock.setEncoding('utf8');
    let buf = '', inData = false, authStep = 0;
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk; let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, ''); buf = buf.slice(nl + 1);
        if (inData) { if (line === '.') { inData = false; sock.write('250 OK: queued\r\n'); } else { captured.data += line + '\n'; } continue; }
        const up = line.toUpperCase();
        if (authStep === 1) { captured.user = Buffer.from(line, 'base64').toString(); authStep = 2; sock.write('334 UGFzc3dvcmQ6\r\n'); }
        else if (authStep === 2) { captured.pass = Buffer.from(line, 'base64').toString(); authStep = 0; sock.write('235 2.7.0 Authenticated\r\n'); }
        else if (up.startsWith('EHLO') || up.startsWith('HELO')) sock.write('250-fake\r\n250 AUTH LOGIN\r\n');
        else if (up.startsWith('AUTH LOGIN')) { authStep = 1; sock.write('334 VXNlcm5hbWU6\r\n'); }
        else if (up.startsWith('MAIL FROM')) { captured.from = line; sock.write('250 OK\r\n'); }
        else if (up.startsWith('RCPT TO')) { captured.rcpt = line; sock.write('250 OK\r\n'); }
        else if (up.startsWith('DATA')) { inData = true; sock.write('354 End data with <CRLF>.<CRLF>\r\n'); }
        else if (up.startsWith('QUIT')) { sock.write('221 Bye\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => {});
  });
  return { server, captured };
}

(async () => {
  await ok('buildMessage encodes a UTF-8 subject and base64 body', () => {
    const raw = buildMessage({ from: 'no-reply@lumi.pl', fromName: 'LUMI' }, { to: 'a@b.pl', subject: 'Привет', text: 'тело' });
    assert.ok(/^Subject: =\?UTF-8\?B\?/m.test(raw), 'subject is RFC2047-encoded');
    assert.ok(/^To: a@b\.pl$/m.test(raw));
    assert.ok(/Content-Transfer-Encoding: base64/.test(raw));
    assert.ok(/\r\n/.test(raw) && !/[^\r]\n/.test(raw), 'CRLF line endings only');
  });

  const { server, captured } = fakeServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  await ok('sendMail authenticates and delivers over the wire', async () => {
    const res = await sendMail(
      { host: '127.0.0.1', port, secure: false, user: 'smtp-user', pass: 's3cret', from: 'no-reply@lumi.pl', fromName: 'LUMI' },
      { to: 'anna@example.com', subject: 'Тест', text: 'hello', html: '<b>hello</b>' },
    );
    assert.strictEqual(res.ok, true);
    assert.strictEqual(captured.user, 'smtp-user');
    assert.strictEqual(captured.pass, 's3cret');
    assert.ok(captured.rcpt.includes('anna@example.com'));
    assert.ok(captured.from.includes('no-reply@lumi.pl'));
    assert.ok(captured.data.includes('multipart/alternative'), 'sends html+text');
  });

  await new Promise((r) => server.close(r));

  await ok('mailer.welcome builds a localized welcome email', () => {
    const pl = mailer.welcome({ email: 'x@y.pl', name: 'Anna Kowalska', role: 'customer', locale: 'pl' });
    assert.ok(/Witaj/.test(pl.subject));
    assert.strictEqual(pl.to, 'x@y.pl');
    assert.ok(pl.html.includes('LUMI') && pl.text.includes('lumi24.pl'));
    const en = mailer.welcome({ email: 'x@y.pl', name: 'Marek', role: 'cleaner', locale: 'en' });
    assert.ok(/Welcome/.test(en.subject) && /verified/i.test(en.text));
  });

  await ok('send() is a safe no-op when SMTP is not configured', async () => {
    const saved = process.env.LUMI_SMTP_HOST; delete process.env.LUMI_SMTP_HOST;
    const r = await mailer.send({ to: 'a@b.pl', subject: 's', text: 't' });
    assert.strictEqual(r.skipped, true);
    if (saved) process.env.LUMI_SMTP_HOST = saved;
  });

  console.log(`\n${n} mailer checks passed.`);
})().catch((e) => { console.error(e); process.exit(1); });
