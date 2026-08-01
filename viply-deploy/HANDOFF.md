# EMAILINC (почта) — состояние проекта и что дальше

> Документ-передача для новой сессии. Прочитай целиком, прежде чем что-то делать.

## Что это

Почтовый сервис **EmailInc** (бывш. Viply) на домене **emailinc.info**:
- `mailserver/` в этой ветке — весь стек: docker-mailserver v14 (Postfix+Dovecot+rspamd+fail2ban),
  Roundcube (webmail), signup-лендинг (Node, порт 8081), multimail «до 10 ящиков» (Node, 8082).
- Лендинг и multimail уже ребрендированы под EmailInc (тёмный #050505/#101114,
  синий #2563FF, циан #43C8FF, конверт-логотип, анимации: констелляция, само-шифрующийся
  заголовок, конвейер You→Lock→Inbox, 3D-tilt формы, живые тосты).
- Установщик: `viply-deploy/viply-setup.sh` (идемпотентный, безопасно перезапускать).

## Сервер (общий с магазином!)

- VPS Aeza: **185.173.144.182**, Ubuntu 26.04, root (пароль у владельца), 1 CPU / 2 GB / 30 GB.
- У ассистента НЕТ ssh-доступа: все команды выполняет владелец, вывод присылает скринами.
- На этом же сервере живёт ДРУГОЙ проект — магазин **stuffweknow.com**
  (папка `sneaker-store/`, ветка та же; авто-синк: cron раз в минуту тянет ветку в
  `/opt/solehaus-src`, см. `/usr/local/bin/solehaus-sync.sh`). ⚠️ НЕ ломать его nginx-конфиг
  (`/etc/nginx/sites-available/solehaus`) — конфиг почты строго отдельный
  (`/etc/nginx/sites-available/viply`), маршрутизация по server_name.

## Рабочий процесс

- Ветка: `claude/new-american-server-jmg9bw` (сюда пушить; владелец явно разрешил).
- Код почты на сервере: отдельный клон в `/opt/viply` (обновляется перезапуском установщика).
- Деплой одной командой (выполняет владелец):
  `curl -fsSL "https://raw.githubusercontent.com/skarausa212-arch43/bestwayplus-/refs/heads/claude/new-american-server-jmg9bw/viply-deploy/viply-setup.sh" | bash`

## DNS (Namecheap, emailinc.info) — состояние на момент передачи

Есть: `A @ → 185.173.144.182`, `TXT @ v=spf1 mx -all`, `TXT _dmarc (DMARC)`,
`MX @ → mail.emailinc.info (10)` через Custom MX.
- [x] **`A mail → 185.173.144.182`** — добавлена, резолв подтверждён 2026-08-01
      (`mail.emailinc.info → 185.173.144.182` через публичные резолверы). Шаг 1/9 установщика пройдёт.
- [ ] **DKIM** — после успешной установки скрипт печатает TXT `mail._domainkey` → вставить в Namecheap.
- [ ] **PTR (rDNS)** `185.173.144.182 → mail.emailinc.info` — тикет в Aeza (владелец писал, ждём).
- [ ] **Порт 25 исходящий** — тот же тикет в Aeza. Пока закрыт — письма наружу не уйдут.

## Статус деплоя

Контейнеры, вероятно, подняты со СТАРОЙ (Viply) версии или частично — владелец говорил
«почтовые сервера подключил», но установщик падал на DNS-проверке (нет A mail), поэтому
nginx-vhost почты и сертификат НЕ созданы → emailinc.info проваливался в default_server
и показывал магазин. Это ожидаемо и чинится успешным прогоном установщика.

## Следующие шаги (по порядку)

1. Дождаться резолва `mail.emailinc.info` → перезапустить установщик (команда выше).
2. Из вывода взять DKIM-запись → добавить в Namecheap (TXT `mail._domainkey`).
3. Проверка: https://emailinc.info/ — лендинг EmailInc; регистрация ящика
   (инвайт-код отключён — регистрация открытая); вход в /multi/; письмо самому себе.
4. Когда Aeza откроет порт 25 + поставит PTR — тест на mail-tester.com (цель 9-10/10).
5. Пароль postmaster: `/root/viply-postmaster.txt` на сервере.

## Telegram-уведомления (опционально)

Кнопка «🔔 Telegram alerts» в /multi/ появляется, только если задан токен бота:
владелец создаёт бота у @BotFather и кладёт токен на сервер:
`echo "ТОКЕН" > /root/emailinc-telegram.token` → перезапустить установщик.
Привязка двумя путями: (1) кнопка → t.me-ссылка → Start; (2) самостоятельно в боте:
/connect → адрес → пароль (бот удаляет сообщение с паролем, вход проверяется по IMAP,
5 неудач/час — стоп). Команды: /add, /list, /stop. Бот-привязки живут в
/data/tg-users.json (volume multimail). Чекер раз в 45с, только INBOX (спам молчит).

## Известные грабли (уже учтены в коде/скрипте — не сломать)

- hostname контейнера ≠ MAIL_DOMAIN (иначе «unknown user»); у нас hostname=mail.emailinc.info.
- postmaster создаётся ДО первого старта DMS (иначе DMS не стартует).
- Roundcube за /webmail/ требует proxy_redirect + proxy_cookie_path (есть в vhost).
- Сертификат берётся webroot'ом через РАБОТАЮЩИЙ nginx (не --standalone — на 80 живёт магазин).
- После регистрации ящика dovecot видит его через 5–15 сек; multimail подключает с ретраями.
- 2 GB RAM: установщик создаёт 2G swap.
