#!/bin/bash
# Ставит статический сайт bestwayfootball.pl на сервер lumi24.pl (89.127.193.91, nginx).
#
# Что скрипт НЕ трогает: конфиги lumi24.pl, bestwayplus.pl, paymesafe и почту.
# Добавляется только отдельный server-блок и свой докрут.
#
# Сертификат здесь НЕ выпускается: пока bestwayfootball.pl смотрит на парковку
# регистратора, Let's Encrypt проверку не пройдёт. Сертификат — вторым шагом,
# скриптом lumi24-issue-certs-football.sh, после смены A-записей.
#
# Запускать на 89.127.193.91 от root (через workflow "Server exec").
set -euo pipefail

BRANCH="claude/best-way-plus-website-qrzy5k"
REPO="skarausa212-arch43/bestwayplus-"
DOCROOT="/var/www/bestwayfootball"

echo "== 1. Забираем каталог site/ из GitHub =="
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
curl -fsSL "https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}" -o "$TMPDIR/src.tgz"
[ -s "$TMPDIR/src.tgz" ] || { echo "ERROR: пустой архив с GitHub"; exit 1; }

# Из всего репозитория нужен только каталог site/.
tar -xzf "$TMPDIR/src.tgz" -C "$TMPDIR" --wildcards '*/site/*'
SRC="$(find "$TMPDIR" -maxdepth 2 -type d -name site | head -1)"
[ -n "$SRC" ] || { echo "ERROR: в архиве нет каталога site/"; exit 1; }

PAGES="$(find "$SRC" -maxdepth 1 -name '*.html' | wc -l)"
[ "$PAGES" -ge 15 ] || { echo "ERROR: страниц всего $PAGES — архив выглядит неполным"; exit 1; }
for lang in pl ru; do
  N="$(find "$SRC/$lang" -maxdepth 1 -name '*.html' 2>/dev/null | wc -l)"
  [ "$N" -ge 15 ] || { echo "ERROR: в языке $lang только $N страниц — архив неполный"; exit 1; }
  echo "страниц в архиве ($lang): $N"
done
echo "страниц в архиве (en): $PAGES"

echo "== 2. Раскладываем в $DOCROOT =="
mkdir -p "$DOCROOT"
# Генератор и служебные файлы Netlify на nginx не нужны.
rm -f "$SRC"/*.py "$SRC/_headers" "$SRC/_redirects" "$SRC/README.md"
# locales/ читает только генератор при сборке; на сервере эти JSON никому не
# нужны и содержат весь текст сайта одним файлом.
rm -rf "$SRC/__pycache__" "$SRC/locales"
# --delete: удалённая из репозитория страница должна исчезать и на сервере.
if command -v rsync >/dev/null; then
  rsync -a --delete "$SRC"/ "$DOCROOT"/
else
  find "$DOCROOT" -mindepth 1 -delete
  cp -a "$SRC"/. "$DOCROOT"/
fi
chown -R www-data:www-data "$DOCROOT" 2>/dev/null || true
echo "файлов в докруте: $(find "$DOCROOT" -type f | wc -l), размер: $(du -sh "$DOCROOT" | cut -f1)"

echo "== 3. nginx server-блок =="
cat > /etc/nginx/sites-available/bestwayfootball <<'EOF'
# bestwayfootball.pl — статический сайт Bestway Football.
# Отдельный блок: конфиги lumi24.pl и bestwayplus.pl не затрагиваются.

server {
    listen 80;
    listen [::]:80;
    server_name bestwayfootball.pl www.bestwayfootball.pl;

    root /var/www/bestwayfootball;
    index index.html;

    gzip on;
    # text/html nginx жмёт всегда — в списке его быть не должно, иначе warning о дубле.
    gzip_types text/css application/javascript image/svg+xml application/xml;
    gzip_min_length 1024;

    # Те же заголовки, что и в _headers для статических хостингов: на nginx
    # файл _headers не читается, поэтому они заданы здесь явно.
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), geolocation=(), microphone=()" always;
    add_header Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'; base-uri 'self'" always;

    location = /robots.txt { access_log off; }
    location = /sitemap.xml { access_log off; }

    location /assets/ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    # Ссылки в сайте ведут на *.html, но /players тоже должен открываться.
    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    access_log /var/log/nginx/bestwayfootball-access.log;
    error_log  /var/log/nginx/bestwayfootball-error.log;
}
EOF

ln -sfn /etc/nginx/sites-available/bestwayfootball /etc/nginx/sites-enabled/bestwayfootball
nginx -t
systemctl reload nginx

# The heredoc above always rewrites this file from a plain-HTTP template, so
# every re-run of this script — including a content-only redeploy, long
# after the certificate exists — would silently wipe the "listen 443 ssl"
# block certbot adds into this same file and drop the live site back to
# HTTP-only. Re-apply it every time: certbot install uses the certificate
# already on disk (no reissue, no rate limit) and is a no-op before that
# certificate exists yet, which is why this is gated on the live dir.
if [ -d /etc/letsencrypt/live/bestwayfootball.pl ]; then
  echo "== 3b. Восстанавливаем HTTPS-блок (certbot) =="
  certbot install --nginx --cert-name bestwayfootball.pl --non-interactive
  nginx -t
  systemctl reload nginx
fi

# reload не мгновенный: старые воркеры ещё принимают соединения, пока не закроют
# текущие. Запрос, попавший в такой воркер, обслуживает default_server (lumi) и
# получает его редирект на https — проверка ниже показала бы 301 на живом сайте.
# Ждём, пока новый блок начнёт отвечать.
for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: bestwayfootball.pl" http://127.0.0.1/ || true)"
  [ "$code" = "200" ] && break
  sleep 0.5
done

echo "== 4. Проверка отдачи по Host-заголовку (до переключения DNS) =="
for path in / /players.html /players /pl/ /pl/players.html /ru/ /ru/players.html \
            /sitemap.xml /robots.txt /assets/site.css; do
  printf '  %-22s ' "$path"
  curl -sS -o /dev/null -w 'HTTP %{http_code}, %{size_download} байт\n' \
       -H "Host: bestwayfootball.pl" "http://127.0.0.1$path" || echo "не ответил"
done

echo
echo "== 5. Соседние сайты не задеты =="
for h in bestwayplus.pl lumi24.pl; do
  printf '  %-18s ' "$h"
  curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "Host: $h" http://127.0.0.1/ || echo "не ответил"
done

echo
echo "Готово. Дальше — A-записи bestwayfootball.pl и www на 89.127.193.91,"
echo "затем lumi24-issue-certs-football.sh для сертификата."
