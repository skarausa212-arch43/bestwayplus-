#!/usr/bin/env bash
# Установка deepfakes/faceswap в локальное виртуальное окружение.
# Использование:
#   ./install-faceswap.sh            # автоопределение GPU (nvidia-smi)
#   ./install-faceswap.sh cpu        # принудительно CPU-версия
#   ./install-faceswap.sh nvidia     # принудительно NVIDIA/CUDA-версия
#   FACESWAP_DIR=~/apps/faceswap ./install-faceswap.sh   # свой каталог
set -euo pipefail

FACESWAP_DIR="${FACESWAP_DIR:-$HOME/faceswap}"
BACKEND="${1:-auto}"

if [[ "$BACKEND" == "auto" ]]; then
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
        BACKEND="nvidia"
    else
        BACKEND="cpu"
    fi
fi
echo "==> Бэкенд: $BACKEND"

PY=python3
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    echo "Нужен Python 3.10+ (найден: $($PY --version))" >&2
    exit 1
fi

if [[ ! -d "$FACESWAP_DIR/.git" ]]; then
    echo "==> Клонирую faceswap в $FACESWAP_DIR"
    git clone --depth 1 https://github.com/deepfakes/faceswap.git "$FACESWAP_DIR"
else
    echo "==> Репозиторий уже есть, обновляю"
    git -C "$FACESWAP_DIR" pull --ff-only
fi

cd "$FACESWAP_DIR"

if [[ ! -d venv ]]; then
    echo "==> Создаю виртуальное окружение"
    "$PY" -m venv venv
fi
./venv/bin/pip install --upgrade pip

echo "==> Устанавливаю зависимости (requirements_${BACKEND}.txt)"
./venv/bin/pip install -r "requirements/requirements_${BACKEND}.txt"

echo "==> Проверка"
./venv/bin/python faceswap.py --version || true
./venv/bin/python faceswap.py extract --help >/dev/null && echo "extract: OK"

cat <<EOF

Готово. Запуск:
  cd $FACESWAP_DIR
  ./venv/bin/python faceswap.py gui        # графический интерфейс (нужен дисплей)
  ./venv/bin/python faceswap.py extract -i <входное видео/фото> -o <папка лиц>
  ./venv/bin/python faceswap.py train -A <лица A> -B <лица B> -m <папка модели> -t villain
  ./venv/bin/python faceswap.py convert -i <вход> -o <выход> -m <папка модели>
EOF
