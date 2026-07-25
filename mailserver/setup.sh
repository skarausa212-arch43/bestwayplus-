#!/bin/bash
# Первичная установка почтового сервера на VPS (Ubuntu/Debian).
# Запускать из папки mailserver/ под root: bash setup.sh
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Сначала: cp .env.example .env  и впишите свой домен." >&2
  exit 1
fi
source .env

echo "== Домен: $MAIL_DOMAIN, хост: $MAIL_HOSTNAME =="

# 1. Docker
if ! command -v docker >/dev/null; then
  echo "== Устанавливаю Docker =="
  curl -fsSL https://get.docker.com | sh
fi

# 2. TLS-сертификат (нужна уже настроенная A-запись mail.домен -> IP этого сервера)
if [ ! -d "/etc/letsencrypt/live/$MAIL_HOSTNAME" ]; then
  echo "== Получаю сертификат Let's Encrypt для $MAIL_HOSTNAME =="
  apt-get update -qq && apt-get install -y -qq certbot
  certbot certonly --standalone -d "$MAIL_HOSTNAME" --non-interactive --agree-tos -m "postmaster@$MAIL_DOMAIN" || {
    echo "Не удалось получить сертификат. Проверьте, что A-запись $MAIL_HOSTNAME указывает на этот сервер и порт 80 свободен." >&2
    exit 1
  }
fi

# 3. Запуск
echo "== Запускаю контейнеры =="
docker compose up -d --build

echo "== Жду запуска почтового сервера... =="
sleep 20

# 4. Служебный ящик (без него docker-mailserver не стартует полностью)
if ! docker exec mailserver setup email list 2>/dev/null | grep -q "postmaster@$MAIL_DOMAIN"; then
  PM_PASS="$(openssl rand -base64 18)"
  docker exec mailserver setup email add "postmaster@$MAIL_DOMAIN" "$PM_PASS"
  echo "Создан ящик postmaster@$MAIL_DOMAIN с паролем: $PM_PASS  — сохраните его!"
fi

# 5. DKIM-ключ для подписи писем
if [ ! -f "docker-data/dms/config/rspamd/dkim/rsa-2048-mail-$MAIL_DOMAIN.private.txt" ]; then
  echo "== Генерирую DKIM-ключ =="
  docker exec mailserver setup config dkim domain "$MAIL_DOMAIN"
  docker restart mailserver
fi

echo
echo "================= ДАЛЬШЕ: настройте DNS ================="
echo "Записи, которые нужно добавить у регистратора домена, — в README.md."
echo "Значение DKIM-записи (mail._domainkey.$MAIL_DOMAIN):"
cat "docker-data/dms/config/rspamd/dkim/rsa-2048-mail-$MAIL_DOMAIN.public.dns.txt" 2>/dev/null || \
  find docker-data/dms/config -name '*.public*' -exec cat {} \;
echo
echo "Веб-почта:    http://127.0.0.1:8080  (проксируйте через nginx, пример в nginx.conf.example)"
echo "Регистрация:  http://127.0.0.1:8081"
