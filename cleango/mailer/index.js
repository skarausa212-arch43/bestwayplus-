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
const DOMAIN = APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

// One email-safe layout (tables + inline styles, no external CSS/JS). The logo
// is a hosted PNG with a text fallback — clients that block images still see
// the green header and "LUMI". Colors are explicit so dark-mode clients don't
// recolor the card.
function shell({ title, sub, bodyHtml, cta, href, footer }) {
  const link = href || APP_URL;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#E9EFED;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(sub || title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9EFED;padding:34px 16px">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(6,42,26,.12)">
      <tr><td style="padding:24px 32px 4px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle"><img src="${APP_URL}/email-logo.png" width="42" height="42" alt="LUMI" style="display:block;border:0;outline:none;border-radius:13px"></td>
          <td style="vertical-align:middle;padding-left:12px;font-size:23px;font-weight:800;letter-spacing:-.01em;color:#0F172A;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">LUMI</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#22C55E;background:linear-gradient(135deg,#34D77F 0%,#22C55E 52%,#059669 100%);border-radius:20px">
          <tr><td style="padding:30px 28px">
            <h1 style="margin:0;font-size:25px;line-height:1.22;font-weight:800;letter-spacing:-.01em;color:#ffffff">${esc(title)}</h1>
            ${sub ? `<p style="margin:10px 0 0;font-size:15.5px;line-height:1.5;color:#EAFBF1">${esc(sub)}</p>` : ''}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 32px 2px;font-size:16px;line-height:1.62;color:#334155">${bodyHtml}</td></tr>
      <tr><td style="padding:22px 32px 8px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td align="center" bgcolor="#16A34A" style="border-radius:13px;background:linear-gradient(135deg,#22C55E,#059669)">
            <a href="${link}" style="display:inline-block;padding:15px 34px;font-size:15.5px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:13px">${esc(cta || 'Otwórz LUMI')} &nbsp;&rarr;</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:24px 32px 30px">
        <div style="border-top:1px solid #EDF1F0;padding-top:18px;font-size:12.5px;line-height:1.6;color:#94A3B8">
          ${footer ? esc(footer) + '<br>' : ''}LUMI &middot; <a href="${APP_URL}" style="color:#94A3B8;text-decoration:none">${esc(DOMAIN)}</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function featList(items) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 2px">` + items.map((f) => `<tr>
    <td style="vertical-align:top;padding:5px 0"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#E7F9EF;color:#059669;border-radius:7px;font-size:13px;font-weight:800">&#10003;</span></td>
    <td style="padding:5px 0 5px 10px;font-size:15px;line-height:1.4;color:#0F172A">${esc(f)}</td></tr>`).join('') + `</table>`;
}

const WELCOME = {
  pl: { subject: 'Witaj w LUMI 🎉', cta: 'Otwórz LUMI', h: 'Witaj w LUMI!', hi: (n) => n ? `Cześć, ${n} 👋` : 'Cześć 👋', footer: 'Otrzymujesz tę wiadomość, ponieważ założono konto w LUMI.',
    role: (r) => r === 'cleaner' ? 'Twoje konto wykonawcy zostało utworzone. Po weryfikacji będziesz przyjmować zlecenia i odbierać wypłaty w aplikacji.' : 'Twoje konto jest gotowe. Zamów sprzątanie w kilka minut i zarządzaj całym domem w jednym miejscu.',
    feats: (r) => r === 'cleaner' ? ['Zlecenia w pobliżu w czasie rzeczywistym', 'Przejrzyste wypłaty, bez ukrytych opłat', 'Oceny i historia budują Twoją reputację'] : ['Uczciwa cena AI jeszcze przed zamówieniem', 'Śledzenie wykonawcy na żywo', 'Inteligentny dom i historia serwisu'] },
  en: { subject: 'Welcome to LUMI 🎉', cta: 'Open LUMI', h: 'Welcome to LUMI!', hi: (n) => n ? `Hi ${n} 👋` : 'Hi 👋', footer: 'You’re receiving this because an account was created on LUMI.',
    role: (r) => r === 'cleaner' ? 'Your provider account is created. Once verified, you’ll accept jobs and receive payouts in the app.' : 'Your account is ready. Book a cleaning in minutes and manage your whole home in one place.',
    feats: (r) => r === 'cleaner' ? ['Nearby jobs in real time', 'Transparent payouts, no hidden fees', 'Ratings and history build your reputation'] : ['A fair AI price before you book', 'Live provider tracking', 'Smart home and service history'] },
  ru: { subject: 'Добро пожаловать в LUMI 🎉', cta: 'Открыть LUMI', h: 'Добро пожаловать в LUMI!', hi: (n) => n ? `Привет, ${n} 👋` : 'Привет 👋', footer: 'Вы получили это письмо, потому что в LUMI создан аккаунт.',
    role: (r) => r === 'cleaner' ? 'Аккаунт исполнителя создан. После проверки вы сможете принимать заказы и получать выплаты в приложении.' : 'Ваш аккаунт готов. Заказывайте уборку за минуты и управляйте всем домом в одном месте.',
    feats: (r) => r === 'cleaner' ? ['Заказы рядом в реальном времени', 'Прозрачные выплаты, без скрытых комиссий', 'Рейтинг и история формируют репутацию'] : ['Честная AI-цена ещё до заказа', 'Живое отслеживание исполнителя', 'Умный дом и история обслуживания'] },
  uk: { subject: 'Ласкаво просимо до LUMI 🎉', cta: 'Відкрити LUMI', h: 'Ласкаво просимо до LUMI!', hi: (n) => n ? `Привіт, ${n} 👋` : 'Привіт 👋', footer: 'Ви отримали цей лист, бо в LUMI створено акаунт.',
    role: (r) => r === 'cleaner' ? 'Акаунт виконавця створено. Після перевірки ви зможете приймати замовлення й отримувати виплати в застосунку.' : 'Ваш акаунт готовий. Замовляйте прибирання за хвилини та керуйте всім домом в одному місці.',
    feats: (r) => r === 'cleaner' ? ['Замовлення поруч у реальному часі', 'Прозорі виплати, без прихованих комісій', 'Рейтинг та історія формують репутацію'] : ['Чесна AI-ціна ще до замовлення', 'Живе відстеження виконавця', 'Розумний дім та історія сервісу'] },
};

const RESET = {
  pl: { subject: 'Reset hasła LUMI', cta: 'Ustaw nowe hasło', h: 'Reset hasła', sub: 'Ustaw nowe hasło do swojego konta LUMI.', footer: 'Nie prosiłeś o reset? Zignoruj tę wiadomość.',
    body: 'Otrzymaliśmy prośbę o zresetowanie hasła. Kliknij przycisk poniżej, aby ustawić nowe. Link jest ważny 1 godzinę i można go użyć tylko raz.',
    ignore: 'Jeśli to nie Ty, po prostu zignoruj tę wiadomość — hasło pozostanie bez zmian.', fallback: 'Jeśli przycisk nie działa, skopiuj ten link do przeglądarki:' },
  en: { subject: 'Reset your LUMI password', cta: 'Set a new password', h: 'Password reset', sub: 'Set a new password for your LUMI account.', footer: 'Didn’t request a reset? Just ignore this email.',
    body: 'We received a request to reset your password. Click the button below to set a new one. The link is valid for 1 hour and can be used only once.',
    ignore: 'If this wasn’t you, just ignore this email — your password stays unchanged.', fallback: 'If the button doesn’t work, copy this link into your browser:' },
  ru: { subject: 'Сброс пароля LUMI', cta: 'Задать новый пароль', h: 'Сброс пароля', sub: 'Задайте новый пароль для аккаунта LUMI.', footer: 'Не запрашивали сброс? Просто проигнорируйте письмо.',
    body: 'Мы получили запрос на сброс пароля. Нажмите кнопку ниже, чтобы задать новый. Ссылка действует 1 час и используется один раз.',
    ignore: 'Если это были не вы — просто проигнорируйте письмо, пароль останется прежним.', fallback: 'Если кнопка не работает, скопируйте ссылку в браузер:' },
  uk: { subject: 'Скидання пароля LUMI', cta: 'Задати новий пароль', h: 'Скидання пароля', sub: 'Задайте новий пароль для акаунта LUMI.', footer: 'Не запитували скидання? Просто проігноруйте лист.',
    body: 'Ми отримали запит на скидання пароля. Натисніть кнопку нижче, щоб задати новий. Посилання дійсне 1 годину й використовується один раз.',
    ignore: 'Якщо це були не ви — просто проігноруйте лист, пароль залишиться незмінним.', fallback: 'Якщо кнопка не працює, скопіюйте посилання у браузер:' },
};

function welcome(user) {
  const loc = WELCOME[user.locale] || WELCOME.pl;
  const name = String(user.name || '').split(' ')[0] || '';
  const line = loc.role(user.role);
  const feats = loc.feats(user.role);
  const bodyHtml = `<p style="margin:0 0 16px">${esc(line)}</p>${featList(feats)}`;
  const text = `${loc.h}\n\n${loc.hi(name)}\n\n${line}\n\n- ${feats.join('\n- ')}\n\n${APP_URL}`;
  return { to: user.email, subject: loc.subject, text, html: shell({ title: loc.h, sub: loc.hi(name), bodyHtml, cta: loc.cta, href: APP_URL, footer: loc.footer }) };
}

function passwordReset(user, token) {
  const loc = RESET[user.locale] || RESET.pl;
  const link = `${APP_URL}/?reset=${encodeURIComponent(token)}`;
  const text = `${loc.h}\n\n${loc.body}\n\n${link}\n\n${loc.ignore}`;
  const bodyHtml = `<p style="margin:0 0 14px">${esc(loc.body)}</p>
    <p style="margin:0 0 4px;font-size:14px;color:#64748B">${esc(loc.ignore)}</p>`;
  const footer = `${loc.fallback} ${link}`;
  return { to: user.email, subject: loc.subject, text, html: shell({ title: loc.h, sub: loc.sub, bodyHtml, cta: loc.cta, href: link, footer }) };
}

module.exports = { isEnabled, send, queue, welcome, passwordReset, config };
