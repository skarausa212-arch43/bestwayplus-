import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Mail transports.
 *
 * Nothing here talks to the network unless SMTP is configured, so development
 * and tests never depend on a mail server being reachable. The `file`
 * transport writes real .eml files you can open — much better than a log line
 * for checking what a buyer would actually receive.
 */

const sent = [];
/** Messages captured by the memory transport, used by tests. */
export const outbox = {
  all: () => sent.slice(),
  clear: () => { sent.length = 0; },
  lastFor: (to) => sent.filter((m) => m.to === to).at(-1) || null
};

const headerSafe = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

function toEml({ from, to, subject, text, html }) {
  const boundary = `dw-${Math.random().toString(36).slice(2)}`;
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    `--${boundary}--`,
    ''
  ].join('\r\n');
}

let smtpTransport = null;
async function sendSmtp(message) {
  if (!smtpTransport) {
    const { default: nodemailer } = await import('nodemailer');
    const { host, port, secure, user, pass } = config.mail.smtp;
    if (!host) throw new Error('MAIL_TRANSPORT=smtp but SMTP_HOST is not set.');
    smtpTransport = nodemailer.createTransport({
      host, port, secure,
      auth: user ? { user, pass } : undefined
    });
  }
  await smtpTransport.sendMail(message);
}

/**
 * Delivers one message. Throws on failure so the caller can record why —
 * a notification that failed to email is still worth keeping in the feed.
 */
export async function sendMail({ to, subject, text, html }) {
  const message = {
    from: config.mail.from,
    to: headerSafe(to),
    subject: headerSafe(subject),
    text,
    html
  };
  if (!message.to) throw new Error('No recipient address.');

  switch (config.mail.transport) {
    case 'memory':
      sent.push({ ...message, at: Date.now() });
      return { transport: 'memory' };

    case 'console':
      console.log(`\n--- mail to ${message.to} ---\n${message.subject}\n\n${message.text}\n`);
      return { transport: 'console' };

    case 'file': {
      await fs.mkdir(config.mail.outDir, { recursive: true });
      const name = `${Date.now()}-${message.to.replace(/[^a-z0-9.@_-]/gi, '_')}.eml`;
      await fs.writeFile(path.join(config.mail.outDir, name), toEml(message));
      return { transport: 'file', file: name };
    }

    case 'smtp':
      await sendSmtp(message);
      return { transport: 'smtp' };

    default:
      throw new Error(`Unknown mail transport: ${config.mail.transport}`);
  }
}
