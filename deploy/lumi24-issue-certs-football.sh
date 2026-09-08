#!/bin/bash
# Выпускает сертификат для bestwayfootball.pl и www.bestwayfootball.pl.
#
# Запускать НА СЕРВЕРЕ lumi24 (89.127.193.91) от root, ПОСЛЕ смены A-записей.
# Пока DNS не переехал, скрипт ждёт и ничего не трогает — чтобы не расходовать
# лимиты Let's Encrypt на заведомо неудачные попытки.
#
# Сертификаты lumi24.pl, bestwayplus.pl и paymesafe не затрагиваются:
# certbot заводит отдельный сертификат под каждое имя.
set -uo pipefail

SELF=89.127.193.91
EMAIL=skarausa212@gmail.com
WAIT_MINUTES=${WAIT_MINUTES:-30}

command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y certbot python3-certbot-nginx; }

# Все A-записи имени, а не первая попавшаяся: лишняя старая запись ломает
# выпуск — проверка Let's Encrypt может уйти на другой сервер.
resolved() { getent ahostsv4 "$1" | awk '{print $1}' | sort -u | tr '\n' ' ' | sed 's/ $//'; }

wait_for_dns() {
  local host=$1 deadline=$(( $(date +%s) + WAIT_MINUTES * 60 ))
  while :; do
    local ips; ips=$(resolved "$host")
    if [ "$ips" = "$SELF" ]; then
      echo "  $host -> $ips  (доехал)"
      return 0
    fi
    if [ -n "$ips" ] && [ "$ips" != "${ips#*$SELF}" ]; then
      echo
      echo "  $host -> $ips"
      echo "  У имени несколько A-записей. Нужна ровно одна: $SELF."
      return 1
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "  $host -> ${ips:-нет ответа}  (за $WAIT_MINUTES мин так и не переехал)"
      return 1
    fi
    printf '\r  ждём %s, сейчас %s ... ' "$host" "${ips:-нет ответа}"
    sleep 30
  done
}

echo "== Ждём, пока домен будет указывать на $SELF =="
READY=1
# app и storage появляются вместе с платформой; если их A-записей ещё нет,
# сертификат для сайта всё равно выпускается — платформа подождёт.
SITE_HOSTS="bestwayfootball.pl www.bestwayfootball.pl"
APP_HOSTS="app.bestwayfootball.pl storage.bestwayfootball.pl"

for h in $SITE_HOSTS; do
  wait_for_dns "$h" || READY=0
done

APP_READY=1
for h in $APP_HOSTS; do
  WAIT_MINUTES=1 wait_for_dns "$h" || APP_READY=0
done

[ "$READY" = 1 ] || { echo; echo "Записи не переехали — сертификат не выпускаю."; exit 1; }

echo
echo "== Сертификат =="
certbot --nginx -d bestwayfootball.pl -d www.bestwayfootball.pl \
        --non-interactive --agree-tos -m "$EMAIL" --redirect

# certbot --redirect уже завернул http в https. Осталось увести www на апекс,
# чтобы у сайта был один канонический адрес — как и объявлено в sitemap.
if ! grep -q 'return 301 https://bestwayfootball.pl' /etc/nginx/sites-available/bestwayfootball; then
  cat >> /etc/nginx/sites-available/bestwayfootball <<'EOF'

# www -> апекс: канонический адрес один, тот же, что в sitemap.xml.
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.bestwayfootball.pl;
    ssl_certificate     /etc/letsencrypt/live/bestwayfootball.pl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bestwayfootball.pl/privkey.pem;
    return 301 https://bestwayfootball.pl$request_uri;
}
EOF
  nginx -t && systemctl reload nginx
fi

if [ "$APP_READY" = 1 ]; then
  echo
  echo "== Сертификат платформы =="
  # Отдельный сертификат: сайт не должен зависеть от имён платформы.
  certbot --nginx -d app.bestwayfootball.pl -d storage.bestwayfootball.pl \
          --non-interactive --agree-tos -m "$EMAIL" --redirect
else
  echo
  echo "app/storage ещё не переехали — сертификат платформы пропускаю."
  echo "Запустите скрипт повторно, когда добавите их A-записи."
fi

echo
echo "== Проверка снаружи =="
for u in https://bestwayfootball.pl/ https://www.bestwayfootball.pl/ \
         https://bestwayfootball.pl/sitemap.xml https://app.bestwayfootball.pl/en \
         https://bestwayplus.pl/ https://lumi24.pl/; do
  printf '  %-42s ' "$u"
  curl -sS -o /dev/null -w 'HTTP %{http_code}, %{size_download} байт\n' "$u" || echo "не ответил"
done
