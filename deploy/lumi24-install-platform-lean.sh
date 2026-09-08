#!/bin/bash
# Ставит платформу Bestway Football на 89.127.193.91 без Docker.
#
# Почему без Docker: на машине 960 МБ RAM и нет swap, она уже держит LUMI и
# PayMeSafe. Четыре контейнера и сборка на месте туда не помещаются — `next
# build` упирается в память раньше, чем в диск. Поэтому сборку делает GitHub
# Actions (workflow "Platform deploy"), сюда приезжает готовый standalone-бандл,
# а запускается он systemd-юнитом, как и два соседних сервиса.
#
# PostgreSQL и Redis ставятся из apt: это десятки мегабайт против ~2 ГБ образов.
#
# Хранилище документов НЕ поднимается на этой машине. MinIO забрал бы ещё
# ~150 МБ RAM, а паспорта легли бы на диск 9.8 ГБ без резервных копий.
# S3_* в .env остаются пустыми; заполняются один раз командой bwf-set-storage
# на самом сервере, чтобы ключ не проходил ни через чат, ни через Actions.
#
# Скрипт идемпотентен: повторный запуск обновляет релиз и не трогает секреты.
set -euo pipefail

ROOT="/opt/bestwayfootball"
APP_HOST="app.bestwayfootball.pl"
APP_PORT=3010
DB_NAME="bwf"
DB_USER="bwf"
BUNDLE="/tmp/platform-bundle.tar.gz"
MIGRATE="${MIGRATE:-true}"

echo "== 0. Проверки перед установкой =="
[ -s "$BUNDLE" ] || { echo "ERROR: нет $BUNDLE — сначала отработает шаг scp"; exit 1; }

AVAIL_MB=$(df -Pm / | awk 'NR==2{print $4}')
echo "  диск: ${AVAIL_MB} МБ свободно"
[ "$AVAIL_MB" -ge 2500 ] || { echo "ERROR: нужно хотя бы 2.5 ГБ свободно"; exit 1; }

# Порт занят — узнать об этом надо до, а не после установки.
if ss -lnt "sport = :$APP_PORT" 2>/dev/null | grep -q LISTEN; then
  echo "ERROR: порт $APP_PORT занят:"; ss -lntp "sport = :$APP_PORT" | tail -n +2; exit 1
fi

command -v node >/dev/null || { echo "ERROR: нет node"; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || { echo "ERROR: нужен node >= 20, есть $(node -v)"; exit 1; }
echo "  node $(node -v)"

echo
echo "== 1. Swap =="
# 960 МБ на три сервиса без swap — приложение убьёт OOM-killer при первом же
# всплеске. Гарантия не производительности, а того, что процесс не исчезнет.
if [ "$(free -m | awk 'NR==3{print $2}')" -lt 512 ]; then
  if [ ! -f /swapfile ]; then
    fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile 2>/dev/null || true
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Своп как страховка, а не как рабочая память: трогаем его только под нажимом.
  sysctl -q -w vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo "  swap: $(free -m | awk 'NR==3{print $2}') МБ"
else
  echo "  swap уже есть: $(free -m | awk 'NR==3{print $2}') МБ"
fi

echo
echo "== 2. PostgreSQL и Redis =="
if ! command -v psql >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends postgresql postgresql-contrib
fi
if ! command -v redis-server >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y -qq --no-install-recommends redis-server
fi
systemctl enable --now postgresql redis-server >/dev/null 2>&1 || true
echo "  postgres: $(sudo -u postgres psql -tAc 'select version()' | cut -c1-30)"
echo "  redis:    $(redis-server --version | cut -d' ' -f3)"

# Postgres на 960 МБ: значения по умолчанию рассчитаны на машину покрупнее.
PGCONF="$(sudo -u postgres psql -tAc 'show config_file')"
if ! grep -q '^# bwf tuning' "$PGCONF"; then
  cat >> "$PGCONF" <<'EOF'

# bwf tuning — машина делит 960 МБ с двумя другими сервисами.
shared_buffers = 96MB
effective_cache_size = 256MB
work_mem = 4MB
maintenance_work_mem = 32MB
max_connections = 40
EOF
  systemctl restart postgresql
  echo "  postgres: параметры под 960 МБ применены"
fi

echo
echo "== 3. База =="
mkdir -p "$ROOT"
ENVFILE="$ROOT/.env"

if [ ! -f "$ENVFILE" ]; then
  # Пароль БД и секреты генерируются один раз и никуда не печатаются.
  # Перегенерация TOKEN_PEPPER обнулила бы все сессии и ссылки на сброс пароля.
  DB_PASS="$(openssl rand -hex 24)"
  umask 077
  cat > "$ENVFILE" <<EOF
NODE_ENV=production
PORT=$APP_PORT
HOSTNAME=127.0.0.1
APP_URL=https://$APP_HOST
ADMIN_URL=https://$APP_HOST
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME?schema=public
REDIS_URL=redis://127.0.0.1:6379
AUTH_SECRET=$(openssl rand -hex 32)
TOKEN_PEPPER=$(openssl rand -hex 32)

# Приватное объектное хранилище. Заполняется командой bwf-set-storage.
# Пока пусто, загрузка документов работать не будет — это осознанно:
# лучше явный отказ, чем паспорта на диске без резервных копий.
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

EMAIL_FROM="Bestway Football <no-reply@bestwayfootball.pl>"
EMAIL_API_KEY=
EOF
  chmod 600 "$ENVFILE"

  sudo -u postgres psql -qc "create role $DB_USER login password '$DB_PASS'" >/dev/null
  sudo -u postgres psql -qc "create database $DB_NAME owner $DB_USER" >/dev/null
  # Расширения ставит суперпользователь: владельцу БД этого не дано.
  sudo -u postgres psql -q -d "$DB_NAME" -c 'create extension if not exists pgcrypto' >/dev/null
  sudo -u postgres psql -q -d "$DB_NAME" -c 'create extension if not exists pg_trgm' >/dev/null
  echo "  создана база $DB_NAME, роль $DB_USER, расширения pgcrypto и pg_trgm"
  unset DB_PASS
else
  echo "  .env уже есть — секреты не трогаем"
fi

echo
echo "== 4. Релиз =="
STAMP="$(date +%Y%m%d-%H%M%S)"
REL="$ROOT/releases/$STAMP"
mkdir -p "$REL"
tar -xzf "$BUNDLE" -C "$REL"
[ -f "$REL/server.js" ] || { echo "ERROR: в бандле нет server.js"; rm -rf "$REL"; exit 1; }
[ -d "$REL/prisma/migrations" ] || { echo "ERROR: в бандле нет миграций"; rm -rf "$REL"; exit 1; }
echo "  распакован $REL ($(du -sh "$REL" | cut -f1))"

if [ "$MIGRATE" = "true" ]; then
  echo
  echo "== 5. Миграции =="
  # CLI миграций ставится отдельно от приложения и переиспользуется между
  # релизами: standalone-бандл его не содержит.
  MIGDIR="$ROOT/migrate"
  mkdir -p "$MIGDIR"
  if ! cmp -s "$REL/migrate/package.json" "$MIGDIR/package.json"; then
    cp "$REL/migrate/package.json" "$MIGDIR/package.json"
    rm -rf "$MIGDIR/node_modules"
  fi
  [ -d "$MIGDIR/node_modules" ] || (cd "$MIGDIR" && npm install --omit=dev --no-audit --no-fund --loglevel=error)

  set -a; . "$ENVFILE"; set +a
  (cd "$REL" && "$MIGDIR/node_modules/.bin/prisma" migrate deploy --schema "$REL/prisma/schema.prisma")
else
  echo
  echo "== 5. Миграции пропущены по запросу =="
fi

echo
echo "== 6. systemd =="
cat > /etc/systemd/system/bwf.service <<EOF
[Unit]
Description=Bestway Football platform
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
WorkingDirectory=$ROOT/current
EnvironmentFile=$ROOT/.env
ExecStart=/usr/bin/node $ROOT/current/server.js
Restart=always
RestartSec=5
# Машина общая: сервис не должен утянуть за собой соседей.
MemoryMax=420M
User=root
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bwf

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

ln -sfn "$REL" "$ROOT/current"
systemctl daemon-reload
systemctl enable bwf >/dev/null 2>&1 || true
systemctl restart bwf

# Старые релизы съедают диск, которого здесь мало. Держим три последних.
ls -1dt "$ROOT"/releases/* 2>/dev/null | tail -n +4 | xargs -r rm -rf

echo
echo "== 7. Ждём, пока приложение поднимется =="
UP=no
for _ in $(seq 1 40); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/en" || true)"
  case "$code" in 200|302|307) UP=yes; break;; esac
  sleep 1
done
if [ "$UP" != "yes" ]; then
  echo "ERROR: приложение не ответило на 127.0.0.1:$APP_PORT. Последние логи:"
  journalctl -u bwf -n 40 --no-pager
  exit 1
fi
echo "  отвечает на 127.0.0.1:$APP_PORT"

echo
echo "== 8. nginx =="
cat > /etc/nginx/sites-available/bestwayfootball-app <<EOF
# $APP_HOST — платформа. Отдельный блок, соседние конфиги не затрагиваются.
server {
    listen 80;
    listen [::]:80;
    server_name $APP_HOST;

    # Документы до 25 МБ загружаются в обход приложения, но формы ходят сюда.
    client_max_body_size 12m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }

    access_log /var/log/nginx/bestwayfootball-app-access.log;
    error_log  /var/log/nginx/bestwayfootball-app-error.log;
}
EOF
ln -sfn /etc/nginx/sites-available/bestwayfootball-app /etc/nginx/sites-enabled/bestwayfootball-app
nginx -t
systemctl reload nginx

# reload не мгновенный: пока старые воркеры не закрыли соединения, запрос
# может уйти в default_server и вернуть его редирект. Ждём новый блок.
for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $APP_HOST" http://127.0.0.1/en || true)"
  case "$code" in 200|302|307) break;; esac
  sleep 0.5
done

echo
echo "== 9. Проверка =="
for path in /en /pl /ru; do
  printf '  %-6s ' "$path"
  curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "Host: $APP_HOST" "http://127.0.0.1$path" || echo 'не ответил'
done

echo
echo "== 10. Соседние сайты не задеты =="
for h in bestwayplus.pl lumi24.pl bestwayfootball.pl; do
  printf '  %-20s ' "$h"
  curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "Host: $h" http://127.0.0.1/ || echo 'не ответил'
done
printf '  %-20s ' "lumi.service"; systemctl is-active lumi.service
printf '  %-20s ' "paymesafe.service"; systemctl is-active paymesafe.service

echo
echo "== 11. Память =="
free -m | awk 'NR==2{printf "  RAM: %d МБ занято из %d, доступно %d\n", $3, $2, $7}'
free -m | awk 'NR==3{printf "  swap: %d МБ из %d\n", $3, $2}'

# Утилита для ключей хранилища: ключ вводится на сервере и никуда не выводится.
cat > /usr/local/bin/bwf-set-storage <<'EOS'
#!/bin/bash
# Записывает доступы к объектному хранилищу в /opt/bestwayfootball/.env.
# Значения вводятся здесь и не попадают ни в историю shell, ни в логи.
set -euo pipefail
ENVFILE=/opt/bestwayfootball/.env
[ -f "$ENVFILE" ] || { echo "нет $ENVFILE"; exit 1; }
read -rp  "S3_ENDPOINT (например https://s3.eu-central-003.backblazeb2.com): " EP
read -rp  "S3_REGION (например eu-central-003): " RG
read -rp  "S3_BUCKET: " BK
read -rp  "S3_ACCESS_KEY_ID: " AK
read -rsp "S3_SECRET_ACCESS_KEY: " SK; echo
for kv in "S3_ENDPOINT=$EP" "S3_REGION=$RG" "S3_BUCKET=$BK" "S3_ACCESS_KEY_ID=$AK" "S3_SECRET_ACCESS_KEY=$SK"; do
  key="${kv%%=*}"
  if grep -q "^$key=" "$ENVFILE"; then
    python3 - "$ENVFILE" "$key" "${kv#*=}" <<'PY'
import sys
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines(True)
out = [(key + "=" + val + "\n") if l.startswith(key + "=") else l for l in lines]
open(path, "w").write("".join(out))
PY
  else
    printf '%s\n' "$kv" >> "$ENVFILE"
  fi
done
chmod 600 "$ENVFILE"
systemctl restart bwf
echo "записано, сервис перезапущен"
EOS
chmod 755 /usr/local/bin/bwf-set-storage

echo
echo "Готово."
echo
if ! grep -q '^S3_BUCKET=.\+' "$ENVFILE"; then
  echo "ВНИМАНИЕ: объектное хранилище не настроено — загрузка документов вернёт"
  echo "ошибку. Заполнить один раз на сервере: bwf-set-storage"
  echo "Бакет должен быть приватным, ключ — с доступом только к нему."
  echo
fi
echo "Дальше: A-запись $APP_HOST на 89.127.193.91, затем"
echo "lumi24-issue-certs-football.sh для сертификата."
