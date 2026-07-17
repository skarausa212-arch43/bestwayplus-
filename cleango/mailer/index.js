/**
 * LUMI transactional email (15_NOTIFICATION_SYSTEM.md — email channel).
 *
 * Relays through an SMTP server configured entirely via env — no secrets in
 * code (CLAUDE.md security rule). When SMTP is not configured the module is a
 * safe no-op that just logs, so dev and CI never depend on a live mail server.
 *
 * Env:
 *   LUMI_SMTP_HOST      smtp host (e.g. smtp.your-domain.pl, smtp-relay.brevo.com)
 *   LUMI_SMTP_PORT      465 (implicit TLS) | 587 (STARTTLS) — default 587
 *   LUMI_SMTP_SECURE    "1" to force implicit TLS (else inferred from port 465)
 *   LUMI_SMTP_USER      smtp username / API login
 *   LUMI_SMTP_PASS      smtp password / API key
 *   LUMI_MAIL_FROM      From address (e.g. no-reply@bestwayplus.pl) — default = user
 *   LUMI_MAIL_FROM_NAME From display name — default "LUMI"
 *   LUMI_SMTP_TLS_INSECURE "1" to skip cert verification (self-signed only; avoid)
 */
'use strict';
const { sendMail } = require('./smtp');

const APP_URL = process.env.LUMI_APP_URL || 'https://lumi.bestwayplus.pl';

function config() {
  const host = (process.env.LUMI_SMTP_HOST || '').trim();
  const port = Number(process.env.LUMI_SMTP_PORT) || 587;
  const user = (process.env.LUMI_SMTP_USER || '').trim();
  const from = (process.env.LUMI_MAIL_FROM || user || '').trim();
  return {
    host, port, user,
    secure: /^(1|true|yes|on)$/i.test(process.env.LUMI_SMTP_SECURE || '') || port === 465,
    pass: process.env.LUMI_SMTP_PASS || '',
    from,
    fromName: (process.env.LUMI_MAIL_FROM_NAME || 'LUMI').trim(),
    rejectUnauthorized: !/^(1|true|yes|on)$/i.test(process.env.LUMI_SMTP_TLS_INSECURE || ''),
  };
}

function isEnabled() { const c = config(); return !!(c.host && c.from); }

// Send now (awaitable). Resolves { skipped:true } when SMTP is not configured.
async function send(msg) {
  if (!isEnabled()) { console.log('[mail] disabled — would send to', msg.to, '·', msg.subject); return { skipped: true }; }
  return sendMail(config(), msg);
}

// Fire-and-forget: never blocks or throws into the request path. Used by the
// server so a slow/broken mail server can't fail registration or a booking.
function queue(msg) {
  if (!msg || !msg.to) return;
  Promise.resolve().then(() => send(msg))
    .then((r) => { if (r && !r.skipped) console.log('[mail] sent to', msg.to, '·', msg.subject); })
    .catch((e) => console.error('[mail] failed to', msg.to, ':', e.message));
}

// ── Localized templates ──
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function shell(title, bodyHtml, cta, href) {
  const link = href || APP_URL;
  return `<!doctype html><html><body style="margin:0;background:#F7FAF9;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #E7EBEA">
      <tr><td style="background:#22C55E;padding:22px 28px"><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:.02em">LUMI</span></td></tr>
      <tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>${bodyHtml}</td></tr>
      <tr><td style="padding:18px 28px 26px">
        <a href="${link}" style="display:inline-block;background:#22C55E;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${esc(cta || 'Открыть LUMI')}</a>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #EEF2F1;color:#64748B;font-size:12px">LUMI · ${esc(APP_URL.replace(/^https?:\/\//, ''))}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

const WELCOME = {
  pl: { subject: 'Witaj w LUMI 🎉', cta: 'Otwórz LUMI',
    h: 'Witaj w LUMI!', role: (r) => r === 'cleaner' ? 'Twoje konto wykonawcy zostało utworzone. Po weryfikacji będziesz mógł przyjmować zlecenia.' : 'Twoje konto zostało utworzone. Zamów sprzątanie w kilka minut i zarządzaj domem w jednym miejscu.' },
  en: { subject: 'Welcome to LUMI 🎉', cta: 'Open LUMI',
    h: 'Welcome to LUMI!', role: (r) => r === 'cleaner' ? 'Your provider account is created. Once verified, you can start accepting jobs.' : 'Your account is created. Book a cleaning in minutes and manage your home in one place.' },
  ru: { subject: 'Добро пожаловать в LUMI 🎉', cta: 'Открыть LUMI',
    h: 'Добро пожаловать в LUMI!', role: (r) => r === 'cleaner' ? 'Аккаунт исполнителя создан. После проверки вы сможете принимать заказы.' : 'Ваш аккаунт создан. Заказывайте уборку за минуты и управляйте домом в одном месте.' },
  uk: { subject: 'Ласкаво просимо до LUMI 🎉', cta: 'Відкрити LUMI',
    h: 'Ласкаво просимо до LUMI!', role: (r) => r === 'cleaner' ? 'Акаунт виконавця створено. Після перевірки ви зможете приймати замовлення.' : 'Ваш акаунт створено. Замовляйте прибирання за хвилини та керуйте домом в одному місці.' },
};

const RESET = {
  pl: { subject: 'Reset hasła LUMI', cta: 'Ustaw nowe hasło', h: 'Reset hasła',
    body: 'Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta LUMI. Kliknij przycisk poniżej, aby ustawić nowe hasło. Link jest ważny 1 godzinę.',
    ignore: 'Jeśli to nie Ty, zignoruj tę wiadomość — hasło pozostanie bez zmian.' },
  en: { subject: 'Reset your LUMI password', cta: 'Set a new password', h: 'Password reset',
    body: 'We received a request to reset the password for your LUMI account. Click the button below to set a new password. The link is valid for 1 hour.',
    ignore: "If this wasn't you, ignore this email — your password stays unchanged." },
  ru: { subject: 'Сброс пароля LUMI', cta: 'Задать новый пароль', h: 'Сброс пароля',
    body: 'Мы получили запрос на сброс пароля к вашему аккаунту LUMI. Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действует 1 час.',
    ignore: 'Если это были не вы — просто проигнорируйте письмо, пароль останется прежним.' },
  uk: { subject: 'Скидання пароля LUMI', cta: 'Задати новий пароль', h: 'Скидання пароля',
    body: 'Ми отримали запит на скидання пароля до вашого акаунта LUMI. Натисніть кнопку нижче, щоб задати новий пароль. Посилання дійсне 1 годину.',
    ignore: 'Якщо це були не ви — просто проігноруйте лист, пароль залишиться незмінним.' },
};

function passwordReset(user, token) {
  const loc = RESET[user.locale] || RESET.pl;
  const link = `${APP_URL}/?reset=${encodeURIComponent(token)}`;
  const text = `${loc.h}\n\n${loc.body}\n\n${link}\n\n${loc.ignore}`;
  const inner = `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#334155">${esc(loc.body)}</p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#64748B">${esc(loc.ignore)}</p>`;
  return { to: user.email, subject: loc.subject, text, html: shell(loc.h, inner, loc.cta, link) };
}

function welcome(user) {
  const loc = WELCOME[user.locale] || WELCOME.pl;
  const name = String(user.name || '').split(' ')[0] || '';
  const greetName = name ? `, ${name}` : '';
  const line = loc.role(user.role);
  const text = `${loc.h}\n\n${line}\n\n${APP_URL}`;
  const inner = `<p style="margin:0 0 6px;font-size:15px;line-height:1.55">${esc(loc.h.replace('!', ''))}${esc(greetName)}!</p>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#334155">${esc(line)}</p>`;
  return { to: user.email, subject: loc.subject, text, html: shell(loc.h, inner, loc.cta) };
}

module.exports = { isEnabled, send, queue, welcome, passwordReset, config };
