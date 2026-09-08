#!/bin/bash
# Ставит платформу Bestway Football на сервер lumi24.pl (89.127.193.91).
#
# Что появляется:
#   /opt/bestwayfootball        — стек docker compose (postgres, redis, minio, app)
#   app.bestwayfootball.pl      — портал, админка, API
#   storage.bestwayfootball.pl  — MinIO, только ради подписанных ссылок
#
# Что скрипт НЕ трогает: lumi24.pl, bestwayplus.pl, paymesafe, почту и
# статический сайт bestwayfootball.pl. Все службы слушают 127.0.0.1 на
# нестандартных портах (5433, 6380, 9002, 3001), чтобы не столкнуться с LUMI.
#
# Сертификаты здесь не выпускаются — сначала A-записи, потом
# lumi24-issue-certs-football.sh.
#
# Запускать на 89.127.193.91 от root (через workflow "Server exec").
set -euo pipefail

BRANCH="claude/best-way-plus-website-qrzy5k"
REPO="skarausa212-arch43/bestwayplus-"
ROOT="/opt/bestwayfootball"
APP_HOST="app.bestwayfootball.pl"
S3_HOST="storage.bestwayfootball.pl"

echo "== 0. Что уже есть на машине =="
free -m | awk 'NR==2{printf "  RAM: %d МБ всего, %d МБ свободно\n", $2, $7}'
df -h / | awk 'NR==2{printf "  Диск: %s свободно из %s\n", $4, $2}'
AVAIL_MB=$(df -Pm / | awk 'NR==2{print $4}')
[ "$AVAIL_MB" -ge 6000 ] || { echo "ERROR: нужно хотя бы 6 ГБ свободно, есть ${AVAIL_MB} МБ"; exit 1; }

if ! command -v docker >/dev/null; then
  echo "== 0a. Ставим docker =="
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null || { echo "ERROR: нет docker compose v2"; exit 1; }

echo "== 1. Исходники =="
mkdir -p "$ROOT"
TMPDIR="$(mktemp -d)"; trap 'rm -rf "$TMPDIR"' EXIT
curl -fsSL "https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}" -o "$TMPDIR/src.tgz"
tar -xzf "$TMPDIR/src.tgz" -C "$TMPDIR" --wildcards '*/platform/*'
SRC="$(find "$TMPDIR" -maxdepth 2 -type d -name platform | head -1)"
[ -d "$SRC/prisma/migrations" ] || { echo "ERROR: в архиве нет миграций"; exit 1; }
rsync -a --delete --exclude node_modules --exclude .next "$SRC"/ "$ROOT/src"/
echo "  исходники: $(find "$ROOT/src" -type f | wc -l) файлов"

echo "== 2. Секреты =="
# Пишутся один раз и больше не перегенерируются: смена TOKEN_PEPPER
# инвалидирует все сессии и ссылки на сброс пароля.
ENV="$ROOT/src/.env"
if [ ! -f "$ENV" ]; then
  gen() { openssl rand -base64 36 | tr -d '/+=' | cut -c1-32; }
  PG_PW="$(gen)"; RD_PW="$(gen)"; S3_KEY="$(gen)"; S3_SECRET="$(gen)"
  cat > "$ENV" <<EOF
NODE_ENV=production
APP_URL=https://${APP_HOST}
DATABASE_URL=postgresql://bwf:${PG_PW}@db:5432/bwf?schema=public
POSTGRES_PASSWORD=${PG_PW}
REDIS_URL=redis://:${RD_PW}@redis:6379
REDIS_PASSWORD=${RD_PW}
AUTH_SECRET=$(openssl rand -base64 32)
TOKEN_PEPPER=$(openssl rand -base64 32)
S3_ENDPOINT=https://${S3_HOST}
S3_REGION=eu-central-1
S3_BUCKET=bwf-documents
S3_ACCESS_KEY_ID=${S3_KEY}
S3_SECRET_ACCESS_KEY=${S3_SECRET}
EMAIL_FROM="Bestway Football <no-reply@bestwayfootball.pl>"
EMAIL_API_KEY=
NEXT_TELEMETRY_DISABLED=1
EOF
  chmod 600 "$ENV"
  echo "  .env создан (значения не печатаются в лог)"
else
  echo "  .env уже есть — оставляю как есть"
fi
cp "$ROOT/src/docker-compose.server.yml" "$ROOT/docker-compose.yml"
ln -sfn "$ROOT/src/.env" "$ROOT/.env"

echo "== 3. Поднимаем хранилище данных =="
cd "$ROOT"
docker compose up -d db redis storage
for i in $(seq 1 30); do
  docker compose ps --format json 2>/dev/null | grep -q '"Health":"starting"' || break
  sleep 5
done
docker compose ps

echo "== 4. Бакет для документов =="
# Приватный по умолчанию: политика anonymous явно снимается, версионирование
# включается — злонамеренная перезапись должна быть обратима.
docker run --rm --network bestwayfootball_default \
  -e MC_HOST_local="http://$(grep '^S3_ACCESS_KEY_ID=' "$ENV" | cut -d= -f2-):$(grep '^S3_SECRET_ACCESS_KEY=' "$ENV" | cut -d= -f2-)@storage:9000" \
  minio/mc:latest sh -c '
    mc mb --ignore-existing local/bwf-documents
    mc anonymous set none local/bwf-documents
    mc version enable local/bwf-documents
    mc ls local' >/dev/null 2>&1 && echo "  бакет bwf-documents: приватный, версионирование включено" \
  || echo "  WARNING: бакет не создан автоматически — проверьте вручную"

echo "== 5. Миграции =="
docker compose run --rm --entrypoint sh app -c 'npx prisma migrate deploy'

echo "== 6. Сборка и запуск приложения =="
docker compose up -d --build app
sleep 10
docker compose ps app

echo "== 7. nginx =="
cat > /etc/nginx/sites-available/bestwayfootball-app <<EOF
# Платформа Bestway Football. Отдельные блоки: конфиги lumi24.pl,
# bestwayplus.pl, paymesafe и статического сайта не затрагиваются.

server {
    listen 80;
    listen [::]:80;
    server_name ${APP_HOST};

    # Документы до 15 МБ идут напрямую в хранилище, но формы и вложения — сюда.
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }

    access_log /var/log/nginx/bwf-app-access.log;
    error_log  /var/log/nginx/bwf-app-error.log;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${S3_HOST};

    # Существует только ради подписанных ссылок: браузер должен дотянуться до
    # объекта по тому же имени, которым его подписал сервер.
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:9002;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
    }

    access_log /var/log/nginx/bwf-storage-access.log;
    error_log  /var/log/nginx/bwf-storage-error.log;
}
EOF

ln -sfn /etc/nginx/sites-available/bestwayfootball-app /etc/nginx/sites-enabled/bestwayfootball-app
nginx -t
systemctl reload nginx

echo "== 8. Проверка =="
printf '  приложение   '; curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "Host: ${APP_HOST}" http://127.0.0.1/en || echo "не ответило"
printf '  хранилище    '; curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "Host: ${S3_HOST}" http://127.0.0.1/minio/health/live || echo "не ответило"
echo "  соседи:"
for h in bestwayplus.pl lumi24.pl bestwayfootball.pl; do
  printf '    %-24s ' "$h"; curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "Host: $h" http://127.0.0.1/ || echo "не ответил"
done

echo
echo "Дальше:"
echo "  1. A-записи app.${APP_HOST#app.} и storage.${S3_HOST#storage.} -> 89.127.193.91"
echo "  2. lumi24-issue-certs-football.sh — сертификаты"
echo "  3. Загрузка документов заработает только после сертификата на ${S3_HOST}:"
echo "     подписанная ссылка отдаётся браузеру по https и до этого недостижима."
