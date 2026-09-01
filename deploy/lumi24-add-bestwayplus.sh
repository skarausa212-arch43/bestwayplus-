#!/bin/bash
# Ставит сайт bestwayplus.pl на сервер lumi24.pl (89.127.193.91, nginx).
# После этого оба домена — lumi24.pl и bestwayplus.pl — живут на одной машине.
#
# Что скрипт НЕ трогает: конфиг lumi24.pl, приложение LUMI, его сертификаты,
# почту и MX-записи. Добавляется только отдельный server-блок nginx.
#
# Запускать на 89.127.193.91 от root (через workflow "Server exec").
set -euo pipefail

BRANCH="claude/migrate-bestwayplus-to-lumi-f335sl"
RAW="https://raw.githubusercontent.com/skarausa212-arch43/bestwayplus-/${BRANCH}/bestwayplus.html"
DOCROOT="/var/www/bestwayplus"
OLD_SERVER="130.17.12.118"   # старый сервер: там остаётся почта и /mail/*
CERT_EMAIL="skarausa212@gmail.com"

echo "== 1. Главная страница сайта =="
mkdir -p "$DOCROOT"
TMP="$(mktemp)"
curl -fsSL "$RAW" -o "$TMP"
[ -s "$TMP" ] || { echo "ERROR: с GitHub пришёл пустой файл"; exit 1; }
install -m 644 "$TMP" "$DOCROOT/index.html"
rm -f "$TMP"
chown -R www-data:www-data "$DOCROOT" 2>/dev/null || true
echo "index.html: $(stat -c%s "$DOCROOT/index.html") байт"

echo "== 2. nginx server-блок =="
cat > /etc/nginx/sites-available/bestwayplus <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name bestwayplus.pl www.bestwayplus.pl;

    root $DOCROOT;
    index index.html;

    gzip on;
    # text/html nginx жмёт всегда, в списке его быть не должно — иначе warning о дубле.
    gzip_types text/css application/javascript image/svg+xml;
    gzip_min_length 1024;

    # Почта осталась на старом сервере — проксируем /mail/*, чтобы вебмейл
    # продолжал открываться по адресу bestwayplus.pl/mail/.
    location /mail/ {
        proxy_pass https://$OLD_SERVER/mail/;
        proxy_set_header Host bestwayplus.pl;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name bestwayplus.pl;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }

    access_log /var/log/nginx/bestwayplus-access.log;
    error_log  /var/log/nginx/bestwayplus-error.log;
}
EOF

ln -sfn /etc/nginx/sites-available/bestwayplus /etc/nginx/sites-enabled/bestwayplus
nginx -t
systemctl reload nginx

echo "== 3. Проверка отдачи (по Host-заголовку, до переключения DNS) =="
CODE="$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: bestwayplus.pl" http://127.0.0.1/)"
SIZE="$(curl -sS -o /dev/null -w '%{size_download}' -H "Host: bestwayplus.pl" http://127.0.0.1/)"
echo "HTTP $CODE, отдано $SIZE байт"

if [ "$CODE" = "200" ]; then
  echo "OK — запрос попадает в наш блок и страница отдаётся."
else
  echo
  echo "!! Ожидался 200. Запрос перехватывает другой server-блок. Подробности:"
  echo "--- заголовки ответа ---"
  curl -sSI -H "Host: bestwayplus.pl" http://127.0.0.1/ | sed 's/^/    /'
  echo "--- какие блоки слушают :80 (файл: строка) ---"
  nginx -T 2>/dev/null | awk '
    /^# configuration file /  { f = $4; sub(/:$/, "", f) }
    /^[[:space:]]*(listen|server_name|return|root)[[:space:]]/ { print "    " f ": " $0 }
  ' | grep -vE '/etc/nginx/(mime\.types|fastcgi|scgi|uwsgi)' | head -60
fi

echo
echo "Готово. Сайт лежит на сервере lumi24 и ждёт DNS."
echo
echo "Дальше по порядку:"
echo "  1) В DNS домена bestwayplus.pl поменять ТОЛЬКО две записи:"
echo "       A  @    -> 89.127.193.91"
echo "       A  www  -> 89.127.193.91"
echo "     MX, TXT (SPF/DKIM/DMARC) и записи поддоменов (mail, paymesafe, office)"
echo "     оставить как есть — почта и поддомены продолжают работать со старого сервера."
echo "  2) Когда DNS разъедется (обычно 15–60 минут), выпустить сертификат:"
echo "       certbot --nginx -d bestwayplus.pl -d www.bestwayplus.pl \\"
echo "               --non-interactive --agree-tos -m $CERT_EMAIL --redirect"
