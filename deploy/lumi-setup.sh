#!/bin/bash
# Разворачивает статический сайт bestwayplus.pl на сервере lumi.pl (Apache).
# Безопасно: не трогает vhost lumi.pl, WordPress и любую почтовую конфигурацию.
# Запускать на сервере 51.254.176.170 от root (через workflow "Server exec").
set -e

BRANCH="claude/migrate-bestwayplus-to-lumi-f335sl"
RAW="https://raw.githubusercontent.com/skarausa212-arch43/bestwayplus-/${BRANCH}/bestwayplus.html"
DOCROOT="/var/www/bestwayplus"

echo "== 1. Файлы сайта =="
mkdir -p "$DOCROOT"
TMP="$(mktemp)"
curl -fsSL "$RAW" -o "$TMP"
[ -s "$TMP" ] || { echo "ERROR: пустой файл с GitHub"; exit 1; }
mv "$TMP" "$DOCROOT/index.html"
chown -R www-data:www-data "$DOCROOT" 2>/dev/null || true
chmod 644 "$DOCROOT/index.html"

echo "== 2. Apache vhost =="
if [ ! -d /etc/apache2/sites-available ]; then
  echo "ERROR: это не Debian/Ubuntu-Apache (нет /etc/apache2/sites-available)."
  echo "Вероятно, сервер управляется панелью (Plesk/cPanel) — нужна ручная настройка."
  exit 1
fi

cat > /etc/apache2/sites-available/bestwayplus.conf <<'EOF'
<VirtualHost *:80>
    ServerName bestwayplus.pl
    ServerAlias www.bestwayplus.pl
    DocumentRoot /var/www/bestwayplus
    DirectoryIndex index.html
    <Directory /var/www/bestwayplus>
        Require all granted
        AllowOverride None
    </Directory>

    # Почта остаётся на старом сервере — /mail/* проксируем туда,
    # чтобы ссылки на вебмейл продолжали работать после переноса сайта.
    SSLProxyEngine on
    SSLProxyCheckPeerName off
    ProxyPreserveHost on
    ProxyPass        /mail/ https://130.17.12.118/mail/
    ProxyPassReverse /mail/ https://130.17.12.118/mail/

    ErrorLog ${APACHE_LOG_DIR}/bestwayplus-error.log
    CustomLog ${APACHE_LOG_DIR}/bestwayplus-access.log combined
</VirtualHost>
EOF

a2enmod proxy proxy_http ssl >/dev/null
a2ensite bestwayplus.conf >/dev/null
apache2ctl configtest
systemctl reload apache2

echo "== 3. Проверка =="
curl -sS -o /dev/null -w "local check: HTTP %{http_code}\n" -H "Host: bestwayplus.pl" http://127.0.0.1/

echo
echo "OK. Дальше:"
echo "  1) Переключить A-записи bestwayplus.pl и www.bestwayplus.pl на 51.254.176.170 (MX/почту не трогать)."
echo "  2) Когда DNS обновится, выпустить сертификат:"
echo "     certbot --apache -d bestwayplus.pl -d www.bestwayplus.pl --non-interactive --agree-tos -m skarausa212@gmail.com --redirect"
