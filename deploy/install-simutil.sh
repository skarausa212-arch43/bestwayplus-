#!/usr/bin/env bash
# Установка simutil — TUI для запуска Android-эмуляторов / iOS-симуляторов.
# Источник: https://github.com/dungngminh/simutil
#
# Использование:
#   ./install-simutil.sh            # последний релиз (нужен доступ к api.github.com)
#   ./install-simutil.sh v0.8.1    # конкретная версия (работает без GitHub API)
#
# После установки: перезапустите терминал (или source ~/.bashrc) и запустите `simutil`.
set -euo pipefail

REPO="dungngminh/simutil"
INSTALL_DIR="$HOME/.local/lib/simutil"
BIN_DIR="$HOME/.local/bin"
FALLBACK_VERSION="v0.8.1"

VERSION="${1:-latest}"
if [ "$VERSION" = "latest" ]; then
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -m 1 '"tag_name":' | cut -d '"' -f 4) || VERSION=""
  if [ -z "$VERSION" ]; then
    echo "[warn] Не удалось узнать последний релиз через GitHub API, ставлю $FALLBACK_VERSION" >&2
    VERSION="$FALLBACK_VERSION"
  fi
fi

case "$(uname -s)" in
  Linux*)  OS="linux" ;;
  Darwin*) OS="macos" ;;
  *) echo "Неподдерживаемая ОС: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Неподдерживаемая архитектура: $(uname -m)" >&2; exit 1 ;;
esac

ASSET="simutil-${OS}-${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
echo "[info] Скачиваю $ASSET ($VERSION)..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
curl -fSL -o "$TMP_DIR/$ASSET" "$URL"

mkdir -p "$INSTALL_DIR" "$BIN_DIR"
tar -xzf "$TMP_DIR/$ASSET" -C "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/simutil"
ln -sf "$INSTALL_DIR/simutil" "$BIN_DIR/simutil"

# Добавляем ~/.local/bin в PATH, если его там ещё нет
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [ -f "$rc" ] && ! grep -q '\.local/bin' "$rc" \
      && echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
  done
fi

echo "[✔] simutil $VERSION установлен: $BIN_DIR/simutil"
"$BIN_DIR/simutil" version
