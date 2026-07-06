#!/bin/bash
# Auto-deploy: подтягивает свежую версию сайта с GitHub и обновляет /var/www/bestwayplus.
# Запускается по cron раз в минуту. Обновляет файл только если он реально изменился.
set -e

BRANCH="claude/server-access-ajcs5w"
RAW="https://raw.githubusercontent.com/skarausa212-arch43/bestwayplus-/${BRANCH}/bestwayplus.html"
DEST="/var/www/bestwayplus/index.html"
LOG="/var/log/bwp-deploy.log"

TMP="$(mktemp)"
if curl -fsSL "$RAW" -o "$TMP" && [ -s "$TMP" ]; then
  if ! cmp -s "$TMP" "$DEST"; then
    mv "$TMP" "$DEST"
    echo "$(date -u +%FT%TZ) deployed new version" >> "$LOG"
  else
    rm -f "$TMP"
  fi
else
  rm -f "$TMP"
  echo "$(date -u +%FT%TZ) fetch failed" >> "$LOG"
fi
