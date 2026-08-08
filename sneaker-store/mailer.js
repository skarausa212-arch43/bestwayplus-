'use strict';
/* Minimal self-contained SMTP client (implicit TLS on 465, or STARTTLS on 587/25).
   Zero external deps — node:tls / node:net only. Used for optional password-reset emails. */
const tls = require('tls');
const net = require('net');

function encodeHeader(s) {
  // RFC 2047 for non-ASCII subject lines
  return /[^\x00-\x7F]/.test(s) ? '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=' : s;
}
function buildMessage(from, fromName, to, subject, html) {
  const date = new Date().toUTCString();
  const boundary = 'swk_' + Math.random().toString(36).slice(2);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return [
    `From: ${fromName ? encodeHeader(fromName) + ' ' : ''}<${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${date}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    `--${boundary}--`,
  ].join('\r\n');
}

// cfg: { host, port, user, pass, from, fromName, secure? }
function sendMail(cfg, { to, subject, html }) {
  return new Promise((resolve, reject) => {
    const port = Number(cfg.port) || 465;
    const implicitTLS = cfg.secure !== false && (port === 465 || cfg.secure === true);
    const from = cfg.from || cfg.user;
    let sock = implicitTLS ? tls.connect({ host: cfg.host, port, servername: cfg.host }) : net.connect({ host: cfg.host, port });
    let upgraded = implicitTLS;
    let done = false;
    const fail = (e) => { if (done) return; done = true; try { sock.destroy(); } catch (_) {} reject(e instanceof Error ? e : new Error(String(e))); };
    const finish = () => { if (done) return; done = true; try { sock.end(); } catch (_) {} resolve(true); };
    sock.setTimeout(15000, () => fail(new Error('SMTP timeout')));
    sock.on('error', fail);

    let buf = '';
    // steps consumed in order; each waits for an expected code then sends its line
    const steps = [];
    const push = (expect, line) => steps.push({ expect, line });
    push([220], `EHLO ${cfg.host}`);
    if (!implicitTLS) push([250], 'STARTTLS');   // upgrade before auth on 587/25
    // (auth + envelope pushed after (re)EHLO — see advance)
    let phase = 0;

    const writeLine = (l) => sock.write(l + '\r\n');
    const sendData = (msg) => sock.write(msg + '\r\n.\r\n');

    let awaiting = null;   // {expect, after}
    const expectThen = (expect, after) => { awaiting = { expect, after }; };

    const startSession = () => {
      // greeting
      expectThen([220], () => {
        writeLine(`EHLO ${cfg.host}`);
        expectThen([250], afterEhlo);
      });
    };
    const afterEhlo = () => {
      if (!implicitTLS && !upgraded) {
        writeLine('STARTTLS');
        expectThen([220], () => {
          const t = tls.connect({ socket: sock, host: cfg.host, servername: cfg.host }, () => {
            upgraded = true; sock = t; wire(t);
            writeLine(`EHLO ${cfg.host}`);
            expectThen([250], afterEhlo);
          });
          t.on('error', fail);
        });
        return;
      }
      // authenticated envelope
      writeLine('AUTH LOGIN');
      expectThen([334], () => {
        writeLine(Buffer.from(String(cfg.user)).toString('base64'));
        expectThen([334], () => {
          writeLine(Buffer.from(String(cfg.pass)).toString('base64'));
          expectThen([235], () => {
            writeLine(`MAIL FROM:<${from}>`);
            expectThen([250], () => {
              writeLine(`RCPT TO:<${to}>`);
              expectThen([250, 251], () => {
                writeLine('DATA');
                expectThen([354], () => {
                  sendData(buildMessage(from, cfg.fromName, to, subject, html));
                  expectThen([250], () => { writeLine('QUIT'); finish(); });
                });
              });
            });
          });
        });
      });
    };

    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const m = /^(\d{3})([ -])/.exec(line);
        if (!m) continue;
        if (m[2] === '-') continue;               // multiline continuation — wait for the final line
        const code = Number(m[1]);
        if (!awaiting) continue;
        if (!awaiting.expect.includes(code)) return fail(new Error('SMTP ' + line));
        const after = awaiting.after; awaiting = null; after();
      }
    };
    const wire = (s) => { s.on('data', onData); s.on('error', fail); };
    wire(sock);
    // kick off once connected (secureConnect for TLS, connect for plain — but greeting drives it)
    startSession();
  });
}

module.exports = { sendMail };
