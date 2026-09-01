#!/bin/bash
# Переносит PayMeSafe (paymesafe.bestwayplus.pl) со старого сервера на сервер lumi24.
#
# Запускается НА СТАРОМ сервере (130.17.12.118) от root и сам заливает всё на новый
# по SSH-ключу /root/.ssh/id_migrate. Данные идут напрямую между серверами и никуда
# больше не попадают.
#
# Предварительно публичный ключ /root/.ssh/id_migrate.pub должен быть добавлен
# в /root/.ssh/authorized_keys на новом сервере.
set -euo pipefail

NEW=89.127.193.91
KEY=/root/.ssh/id_migrate
APP=/opt/paymesafe
DOMAIN=paymesafe.bestwayplus.pl
SSH="ssh -i $KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

echo "== 1. Проверяем связь с новым сервером =="
$SSH "root@$NEW" 'echo "  подключение есть: $(hostname)"'

echo "== 2. Node на новом сервере =="
if ! $SSH "root@$NEW" 'command -v node >/dev/null'; then
  echo "  node не найден, ставим Node 20"
  $SSH "root@$NEW" 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 && apt-get install -y nodejs >/dev/null 2>&1'
fi
$SSH "root@$NEW" 'echo "  node $(node -v)"'

echo "== 3. Выбираем порт (3001, если он свободен) =="
PORT=$($SSH "root@$NEW" 'if ss -tln | grep -q ":3001 "; then echo 3011; else echo 3001; fi')
echo "  порт: $PORT"

echo "== 4. Копируем приложение вместе с данными =="
# Останавливаем сервис на время снятия копии, чтобы users.json не менялся на лету.
systemctl stop paymesafe
tar czf - -C "$(dirname $APP)" "$(basename $APP)" \
  | $SSH "root@$NEW" "mkdir -p $(dirname $APP) && tar xzf - -C $(dirname $APP)"
systemctl start paymesafe
echo "  скопировано, старый сервис снова запущен"

$SSH "root@$NEW" "ls -la $APP/data/"

echo "== 5. systemd-юнит на новом сервере =="
DEPOSIT=$(grep -oE 'PLATFORM_DEPOSIT_ADDRESS=[^"]*' /etc/systemd/system/paymesafe.service | head -1 | cut -d= -f2-)
$SSH "root@$NEW" "cat > /etc/systemd/system/paymesafe.service <<EOF
[Unit]
Description=PayMeSafe escrow platform
After=network.target

[Service]
WorkingDirectory=$APP
ExecStart=/usr/bin/node server.js
Environment=PORT=$PORT
Environment=PLATFORM_DEPOSIT_ADDRESS=$DEPOSIT
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now paymesafe
sleep 2
systemctl is-active paymesafe"

echo "== 6. nginx vhost для $DOMAIN =="
$SSH "root@$NEW" "cat > /etc/nginx/sites-available/paymesafe <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }

    access_log /var/log/nginx/paymesafe-access.log;
    error_log  /var/log/nginx/paymesafe-error.log;
}
EOF
ln -sfn /etc/nginx/sites-available/paymesafe /etc/nginx/sites-enabled/paymesafe
nginx -t && systemctl reload nginx"

echo "== 7. Проверка =="
$SSH "root@$NEW" "curl -sS -o /dev/null -w '  напрямую в приложение: HTTP %{http_code}\n' http://127.0.0.1:$PORT/
curl -sS -o /dev/null -w '  через nginx по Host: HTTP %{http_code}\n' -H 'Host: $DOMAIN' http://127.0.0.1/"

echo
echo "Готово. PayMeSafe поднят на новом сервере и ждёт DNS."
echo "Дальше: A-запись $DOMAIN -> $NEW, затем на новом сервере"
echo "  certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m skarausa212@gmail.com --redirect"
