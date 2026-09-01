#!/bin/bash
# Ждёт, пока DNS переедет на сервер lumi24, и выпускает сертификаты для
# bestwayplus.pl, www.bestwayplus.pl и paymesafe.bestwayplus.pl.
#
# Запускать НА СЕРВЕРЕ lumi24 (89.127.193.91) от root, после смены A-записей.
# Пока DNS не переехал, скрипт просто ждёт и ничего не трогает.
#
# Существующий сертификат lumi24.pl / lumi.bestwayplus.pl не затрагивается:
# certbot заводит отдельные сертификаты под каждое имя.
set -uo pipefail

SELF=89.127.193.91
EMAIL=skarausa212@gmail.com
WAIT_MINUTES=${WAIT_MINUTES:-60}

command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y certbot python3-certbot-nginx; }

resolved() { getent hosts "$1" | awk '{print $1}' | head -1; }

wait_for_dns() {
  local host=$1 deadline=$(( $(date +%s) + WAIT_MINUTES * 60 ))
  while :; do
    local ip; ip=$(resolved "$host")
    if [ "$ip" = "$SELF" ]; then
      echo "  $host -> $ip  (доехал)"
      return 0
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "  $host -> ${ip:-нет ответа}  (за $WAIT_MINUTES мин так и не переехал)"
      return 1
    fi
    printf '\r  ждём %s, сейчас %s ... ' "$host" "${ip:-нет ответа}"
    sleep 30
  done
}

echo "== Ждём, пока домены будут указывать на $SELF =="
READY=1
for h in bestwayplus.pl www.bestwayplus.pl paymesafe.bestwayplus.pl; do
  wait_for_dns "$h" || READY=0
done

[ "$READY" = 1 ] || { echo; echo "Не все записи переехали — сертификаты не выпускаю, чтобы не ловить лимиты Let's Encrypt."; exit 1; }

echo
echo "== Сертификат для сайта =="
certbot --nginx -d bestwayplus.pl -d www.bestwayplus.pl \
        --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "== Сертификат для PayMeSafe =="
certbot --nginx -d paymesafe.bestwayplus.pl \
        --non-interactive --agree-tos -m "$EMAIL" --redirect

echo
echo "== Проверка снаружи =="
for u in https://bestwayplus.pl/ https://www.bestwayplus.pl/ https://paymesafe.bestwayplus.pl/ https://lumi24.pl/; do
  printf '  %-38s ' "$u"
  curl -sS -o /dev/null -w 'HTTP %{http_code}, %{size_download} байт\n' "$u" || echo "не ответил"
done
