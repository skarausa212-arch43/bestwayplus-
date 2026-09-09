#!/bin/bash
# Поднимает исходящую почту для bestwayfootball.pl на lumi24.pl (89.127.193.91).
#
# Только исходящая: Postfix слушает лишь 127.0.0.1:25 (locoloop-only) — заявка
# на письмо принимается только от самого приложения на этой же машине, снаружи
# порт 25 не открыт вообще. Входящую почту (MX-запись) этот скрипт не трогает —
# она не нужна для транзакционных писем.
#
# Что скрипт НЕ трогает: конфиги lumi24.pl, bestwayplus.pl, paymesafe.
#
# Запускать на 89.127.193.91 от root (через workflow "Server exec").
set -euo pipefail

DOMAIN="bestwayfootball.pl"
MAILHOST="mail.$DOMAIN"
SELECTOR="default"

echo "== 0. Проверка: не заблокирован ли исходящий 25 порт провайдером =="
if timeout 5 bash -c "cat < /dev/null > /dev/tcp/gmail-smtp-in.l.google.com/25" 2>/dev/null; then
  echo "  порт 25 наружу открыт — хорошо"
else
  echo "  ВНИМАНИЕ: исходящее соединение на 25 порт не установилось."
  echo "  Многие хостинги режут его по умолчанию против спама. Если это тот"
  echo "  случай — нужно написать в поддержку Fornex с просьбой открыть исходящий"
  echo "  25 порт для этого сервера. Без этого письма никуда не уйдут независимо"
  echo "  от остальной настройки. Продолжаю установку — она понадобится в любом случае."
fi

echo "== 1. Postfix (Internet Site, non-interactive) =="
debconf-set-selections <<EOF
postfix postfix/main_mailer_type select Internet Site
postfix postfix/mailname string $DOMAIN
EOF
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postfix opendkim opendkim-tools >/dev/null

echo "== 2. main.cf — только локальный релей, ничего наружу не принимаем =="
postconf -e "myhostname = $MAILHOST"
postconf -e "myorigin = $DOMAIN"
# Только localhost и сам хост — НЕ $DOMAIN, иначе postfix попытается доставлять
# почту на @$DOMAIN локально вместо релея, а реальных ящиков там нет.
postconf -e "mydestination = \$myhostname, localhost"
postconf -e "inet_interfaces = loopback-only"
postconf -e "smtp_tls_security_level = may"
postconf -e "smtpd_milters = inet:localhost:8891"
postconf -e "non_smtpd_milters = inet:localhost:8891"
postconf -e "milter_default_action = accept"
postconf -e "milter_protocol = 6"

echo "== 3. OpenDKIM =="
mkdir -p /etc/opendkim/keys/$DOMAIN
if [ ! -f "/etc/opendkim/keys/$DOMAIN/$SELECTOR.private" ]; then
  opendkim-genkey -b 2048 -d "$DOMAIN" -s "$SELECTOR" -D "/etc/opendkim/keys/$DOMAIN"
  echo "  новый ключ DKIM сгенерирован"
else
  echo "  ключ DKIM уже есть — не трогаю"
fi
chown -R opendkim:opendkim /etc/opendkim/keys
chmod 700 /etc/opendkim/keys/$DOMAIN
chmod 600 /etc/opendkim/keys/$DOMAIN/$SELECTOR.private

cat > /etc/opendkim.conf <<EOF
Syslog          yes
UMask           022
Domain          $DOMAIN
KeyFile         /etc/opendkim/keys/$DOMAIN/$SELECTOR.private
Selector        $SELECTOR
Socket          inet:8891@localhost
PidFile         /run/opendkim/opendkim.pid
Mode            sv
SubDomains      no
AutoRestart     yes
EOF

sed -i 's/^SOCKET=.*/SOCKET="inet:8891@localhost"/' /etc/default/opendkim 2>/dev/null || \
  echo 'SOCKET="inet:8891@localhost"' >> /etc/default/opendkim

echo "== 4. Перезапуск =="
systemctl enable --now opendkim >/dev/null
systemctl restart opendkim
postfix check
systemctl enable --now postfix >/dev/null
systemctl restart postfix

echo "== 5. Проверка =="
sleep 1
ss -tlnp | grep -q ':25 ' && echo "  postfix слушает 127.0.0.1:25" || echo "  ВНИМАНИЕ: postfix не слушает 25 порт"
ss -tlnp | grep -q ':8891 ' && echo "  opendkim слушает 8891" || echo "  ВНИМАНИЕ: opendkim не поднялся"

echo
echo "== Готово. DNS-записи — добавить у регистратора домена $DOMAIN: =="
echo
echo "SPF (TXT на $DOMAIN):"
echo "  v=spf1 ip4:89.127.193.91 ~all"
echo
echo "DKIM (TXT на $SELECTOR._domainkey.$DOMAIN):"
cat "/etc/opendkim/keys/$DOMAIN/$SELECTOR.txt"
echo
echo "DMARC (TXT на _dmarc.$DOMAIN), можно начать мягко:"
echo "  v=DMARC1; p=none; rua=mailto:postmaster@$DOMAIN"
echo
echo "И отдельно, не через DNS — обратной записи (PTR) для 89.127.193.91 на"
echo "$MAILHOST нужно попросить у Fornex (это делается в панели хостинга,"
echo "не в DNS-зоне домена). Без неё многие принимающие серверы будут"
echo "заворачивать письма как подозрительные."
