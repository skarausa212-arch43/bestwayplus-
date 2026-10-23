/**
 * Ops helper: send a test email from the server to check SMTP works.
 *
 *   node mailer/send-test.js you@example.com
 *
 * Loads the server-only secrets (deploy/instance.local.env, then instance.env)
 * the same way the service does, so it works over SSH without exporting anything.
 * Prints whether SMTP is enabled, the (password-free) config, and the send
 * result. Awaits the real send so a failure shows the exact SMTP error.
 */
'use strict';
const fs = require('fs');

// Same merge as the systemd drop-in renderer: a key assigned twice resolves
// here exactly as it does for the running service.
const { loadInstanceEnv } = require('../deploy/render-env-dropin');
loadInstanceEnv([(process.env.LUMI_APP_DIR || '/opt/lumi') + '/deploy', require('path').join(__dirname, '..', 'deploy')]);

const mailer = require('./index');

const to = (process.argv[2] || '').trim();
if (!to || !to.includes('@')) {
  console.log('usage: node mailer/send-test.js you@example.com');
  process.exit(1);
}
// Catch the placeholder before we spend a connection on it: a domain with no
// dot ("своя@почта", "me@localhost") is a single-label domain, which Microsoft
// 365 rejects with 501 5.1.6 — an error about the RECIPIENT that reads like a
// problem with our own setup.
const domainPart = to.split('@').pop();
if (!domainPart.includes('.') || /[А-Яа-яЁёІіЇїЄє]/.test(to)) {
  console.log(`✗ «${to}» — это не адрес, а заполнитель из инструкции.`);
  console.log('  Укажите настоящий ящик, например: node mailer/send-test.js you@gmail.com');
  process.exit(1);
}

const c = mailer.config();
console.log('smtp host     :', c.host || '(none)');
console.log('smtp port     :', c.port, c.secure ? '(implicit TLS)' : '(STARTTLS)');
console.log('smtp user     :', c.user || '(none)');
console.log('mail from     :', c.fromName ? `${c.fromName} <${c.from}>` : c.from || '(none)');
console.log('isEnabled     :', mailer.isEnabled());
if (!mailer.isEnabled()) {
  console.log('\n✗ SMTP not configured. Set LUMI_SMTP_* + LUMI_MAIL_FROM in /opt/lumi/deploy/instance.local.env.');
  process.exit(1);
}

console.log('\nsending test email to', to, '…');
mailer.send({
  to,
  subject: 'LUMI — тест доставки писем ✅',
  text: 'Это тестовое письмо от LUMI. Если ты его читаешь — отправка писем работает.',
  html: '<p>Это тестовое письмо от <b>LUMI</b>. Если ты его читаешь — отправка писем работает. 🎉</p>',
}).then((r) => {
  if (r && r.skipped) console.log('✗ skipped (SMTP disabled).');
  else console.log('✓ Sent. Check the inbox (and Spam) of', to);
}).catch((e) => {
  const m = String((e && e.message) || e);
  console.log('\n✗ SMTP error:', m);
  // The raw SMTP status is useless to a human at 2am. Map the failures we
  // actually hit on Microsoft 365 to the one thing that fixes each of them.
  const hints = [
    [/5\.7\.139|535/, [
      'Аутентификация отклонена. По порядку:',
      '  1. В Microsoft 365 admin center → Пользователи → почтовый ящик → Почта →',
      '     «Управление приложениями электронной почты» → включить Authenticated SMTP.',
      '     Изменение применяется до ~1 часа.',
      '  2. Если у аккаунта включена MFA — обычный пароль не подойдёт, нужен app password.',
      '  3. LUMI_SMTP_USER должен быть полным адресом ящика (support@lumi24.pl), не алиасом.',
    ]],
    [/5\.1\.6|501/, [
      'Сервер отверг АДРЕС ПОЛУЧАТЕЛЯ, а не наши настройки.',
      '  Аутентификация при этом прошла — до RCPT TO дело доходит только после успешного AUTH.',
      '  Проверьте, что указали реальный ящик с доменом (you@gmail.com).',
    ]],
    [/5\.7\.60|SendAsDenied/i, [
      'Ящик не имеет права отправлять от этого адреса.',
      '  LUMI_MAIL_FROM должен совпадать с LUMI_SMTP_USER (или иметь право Send As).',
    ]],
    [/STARTTLS/, [
      'Сервер не предложил шифрование, и пароль отправлять нельзя.',
      '  Проверьте порт: 587 (STARTTLS) или 465 (LUMI_SMTP_SECURE=1). Порт 25 у большинства провайдеров закрыт.',
    ]],
    [/ETIMEDOUT|ECONNREFUSED|timeout/i, [
      'Соединение не установилось — почти всегда это блокировка исходящего порта у хостера.',
      '  Проверьте с сервера:  nc -vz smtp.office365.com 587',
      '  Если закрыто — попросите хостера открыть 587, либо используйте API-провайдера (Brevo/SES/Postmark).',
    ]],
    [/certificate|self.signed|CERT_/i, [
      'TLS-сертификат сервера не проверился.',
      '  Не отключайте проверку в проде — сначала убедитесь, что LUMI_SMTP_HOST написан без опечатки.',
    ]],
  ];
  const hit = hints.find(([re]) => re.test(m));
  if (hit) { console.log(''); for (const line of hit[1]) console.log('  ' + line); }
  console.log('\n  Доставка зависит ещё и от DNS — проверьте:  node ops/mail-dns-check.js');
  process.exit(1);
});
